// workout-logging.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { handlePrismaError } from '../../common/utils/prisma-error.handler';
import { plainToInstance } from 'class-transformer';
import {
  CreateWorkoutLogDto,
  CreateWorkoutSetDto,
} from './dtos/create-workout-logging.dto';
import {
  UpdateWorkoutLogDto,
  UpdateWorkoutSetDto,
} from './dtos/update-workout-logging.dto';
import {
  WorkoutLogResponseDto,
  WorkoutLogHistoryResponseDto,
  GetWorkoutLogsQueryDto,
} from './dtos/workout-logging-response.dto';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Workout Logging Service
 *
 * Handles all business logic for workout logging and set tracking.
 *
 * Responsibilities:
 * - Create workout logs with sets (atomic transaction)
 * - Update logs and sets (upsert pattern)
 * - Fetch user's workout history with filtering
 * - Calculate derived metrics (volume, e1RM, trends)
 * - Validate ownership and data integrity
 * - Support both programmed and ad-hoc workouts
 *
 * Design principles:
 * - Transactional: Log + sets created/updated atomically
 * - Ownership validation: Users can only access their own logs
 * - Rich responses: Includes nested exercise and set details
 * - Flexible: Supports programmed (with plan context) and ad-hoc workouts
 * - Idempotent where possible: Safe to retry operations
 *
 * Dependencies:
 * - PrismaService: Database access
 * - Logger: Structured logging
 */
@Injectable()
export class WorkoutLoggingService {
  private readonly logger = new Logger(WorkoutLoggingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Create a workout log with sets.
   *
   * Flow:
   * 1. Validate optional references (planId, dayId, itemId, exerciseId)
   * 2. Create WorkoutLog record
   * 3. Create all WorkoutSet records (setNumber assigned sequentially)
   * 4. Return complete log with sets and exercise details
   *
   * Transaction: Ensures log + sets created together or not at all
   * Validation: All IDs verified to exist and belong to user (if applicable)
   *
   * @param userId - Authenticated user ID from JWT
   * @param dto - Workout log data with sets
   * @returns Created log with nested sets and exercise
   */
  async createWorkoutLog(
    userId: string,
    dto: CreateWorkoutLogDto,
  ): Promise<WorkoutLogResponseDto> {
    this.logger.log(
      `Creating workout log for user ${userId}, exercise ${dto.exerciseId}, ${dto.sets.length} sets`,
    );

    // Validate exercise exists
    const exercise = await this.prisma.exercise.findUnique({
      where: { id: dto.exerciseId },
    });

    if (!exercise) {
      throw new NotFoundException(`Exercise ${dto.exerciseId} not found`);
    }

    // Validate optional plan/day/item references
    await this.validatePlanReferences(userId, dto);

    // Get transaction configuration
    const txConfig = this.configService.get('transaction.default') || {
      maxWait: 2000,
      timeout: 5000,
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    };

    try {
      // Create log and sets in transaction with proper error handling
      const workoutLog = await this.prisma.$transaction(async (tx) => {
        // Create workout log
        const log = await tx.workoutLog.create({
          data: {
            userId,
            exerciseId: dto.exerciseId,
            planId: dto.planId || null,
            dayId: dto.dayId || null,
            itemId: dto.itemId || null,
            performedAt: dto.performedAt
              ? new Date(dto.performedAt)
              : new Date(),
            durationMin: dto.durationMin || null,
            notes: dto.notes || null,
          },
        });

        // Create all sets
        await tx.workoutSet.createMany({
          data: dto.sets.map((set, index) => ({
            logId: log.id,
            setNumber: index + 1, // 1-indexed
            reps: set.reps ?? null,
            weightKg: set.weightKg ?? null,
            rir: set.rir ?? null,
            completed: set.completed ?? true,
          })),
        });

        // Fetch complete log with sets and exercise
        return tx.workoutLog.findUnique({
          where: { id: log.id },
          include: {
            sets: {
              orderBy: { setNumber: 'asc' },
            },
            exercise: true,
          },
        });
      }, txConfig);

      if (!workoutLog) {
        throw new InternalServerErrorException('Failed to create workout log');
      }

      this.logger.log(`Successfully created workout log ${workoutLog.id}`);

      // Check for PR achievements and send notifications
      await this.checkForPrAndNotify(userId, workoutLog);

      return this.transformToResponseDto(workoutLog);
    } catch (error) {
      // Handle Prisma-specific errors
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        this.logger.error(
          `Prisma error creating workout log: ${error.code} - ${error.message}`,
          error.stack,
        );

        switch (error.code) {
          case 'P2002':
            // Unique constraint violation
            throw new BadRequestException({
              message: 'A workout log with this data already exists',
              error: 'WorkoutLogAlreadyExists',
            });
          case 'P2003':
            // Foreign key constraint violation
            throw new BadRequestException({
              message: 'Invalid reference to exercise, plan, day, or item',
              error: 'InvalidForeignKey',
            });
          case 'P2025':
            // Record not found
            throw new NotFoundException({
              message: 'Referenced record not found',
              error: 'RecordNotFound',
            });
          default:
            throw new InternalServerErrorException({
              message: 'Database operation failed',
              error: 'DatabaseError',
            });
        }
      }

      // Handle transaction timeout errors
      if (error instanceof Prisma.PrismaClientUnknownRequestError) {
        this.logger.error(
          `Transaction timeout creating workout log: ${error.message}`,
          error.stack,
        );
        throw new InternalServerErrorException({
          message: 'Operation timed out. Please try again.',
          error: 'TransactionTimeout',
        });
      }

      // Re-throw if already a NestJS exception
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      // Generic error handling
      this.logger.error(
        `Failed to create workout log: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to create workout log');
    }
  }

  /**
   * Get workout log by ID.
   *
   * Security: Verifies log belongs to requesting user
   *
   * @param logId - Workout log ID
   * @param userId - Authenticated user ID
   * @returns Log with sets and exercise details
   * @throws 404 if not found, 403 if wrong user
   */
  async getWorkoutLog(
    logId: string,
    userId: string,
  ): Promise<WorkoutLogResponseDto> {
    try {
      const log = await this.prisma.workoutLog.findUnique({
        where: { id: logId },
        include: {
          sets: {
            orderBy: { setNumber: 'asc' },
          },
          exercise: true,
        },
      });

      if (!log) {
        throw new NotFoundException({
          message: `Workout log ${logId} not found`,
          error: 'WorkoutLogNotFound',
        });
      }

      // Ownership check
      if (log.userId !== userId) {
        this.logger.warn(
          `User ${userId} attempted to access log ${logId} owned by ${log.userId}`,
        );
        throw new ForbiddenException({
          message: 'You do not have access to this workout log',
          error: 'WorkoutLogAccessDenied',
        });
      }

      return this.transformToResponseDto(log);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'get workout log');
    }
  }

  /**
   * Get user's workout logs with filtering and pagination.
   *
   * Supports filtering by:
   * - Exercise (all logs for bench press)
   * - Plan (all logs from current program)
   * - Date range (logs from last month)
   *
   * Results paginated and sorted by performedAt descending (newest first).
   *
   * @param userId - Authenticated user ID
   * @param query - Filter and pagination parameters
   * @returns Paginated workout logs
   */
  async getUserWorkoutLogs(
    userId: string,
    query: GetWorkoutLogsQueryDto,
  ): Promise<WorkoutLogHistoryResponseDto> {
    try {
      const page = query.page || 1;
      const limit = Math.min(query.limit || 20, 100);
      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = {
        userId,
        ...(query.exerciseId && { exerciseId: query.exerciseId }),
        ...(query.planId && { planId: query.planId }),
      };

      // Date range filtering
      if (query.startDate || query.endDate) {
        where.performedAt = {};
        if (query.startDate) {
          where.performedAt.gte = new Date(query.startDate);
        }
        if (query.endDate) {
          where.performedAt.lte = new Date(query.endDate);
        }
      }

      // Fetch logs and count in parallel
      const [logs, total] = await Promise.all([
        this.prisma.workoutLog.findMany({
          where,
          include: {
            sets: {
              orderBy: { setNumber: 'asc' },
            },
            exercise: true,
          },
          orderBy: {
            performedAt: 'desc',
          },
          skip,
          take: limit,
        }),
        this.prisma.workoutLog.count({ where }),
      ]);

      return {
        logs: logs.map((log) => this.transformToResponseDto(log)),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      handlePrismaError(error, this.logger, 'get user workout logs');
    }
  }

  /**
   * Update workout log.
   *
   * Flow:
   * 1. Verify log exists and user owns it
   * 2. Update log fields (duration, notes)
   * 3. Upsert sets if provided (update existing, add new)
   * 4. Return updated log
   *
   * Transaction: Ensures log + set updates happen atomically
   * Idempotency: Same updates produce same result
   *
   * @param logId - Workout log ID
   * @param userId - Authenticated user ID
   * @param dto - Update data
   * @returns Updated log with sets
   */
  async updateWorkoutLog(
    logId: string,
    userId: string,
    dto: UpdateWorkoutLogDto,
  ): Promise<WorkoutLogResponseDto> {
    // Verify log exists and ownership
    await this.getLogOrThrow(logId, userId);

    this.logger.log(`Updating workout log ${logId}`);

    // Get transaction configuration
    const txConfig = this.configService.get('transaction.default') || {
      maxWait: 2000,
      timeout: 5000,
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    };

    try {
      // Update in transaction with proper error handling
      await this.prisma.$transaction(async (tx) => {
        // Update log fields
        if (dto.durationMin !== undefined || dto.notes !== undefined) {
          await tx.workoutLog.update({
            where: { id: logId },
            data: {
              ...(dto.durationMin !== undefined && {
                durationMin: dto.durationMin,
              }),
              ...(dto.notes !== undefined && { notes: dto.notes }),
            },
          });
        }

        // Upsert sets if provided
        if (dto.sets && dto.sets.length > 0) {
          await this.upsertSetsInTransaction(tx, logId, dto.sets);
        }
      }, txConfig);

      // Return updated log
      return this.getWorkoutLog(logId, userId);
    } catch (error) {
      // Handle Prisma-specific errors
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        this.logger.error(
          `Prisma error updating workout log ${logId}: ${error.code} - ${error.message}`,
          error.stack,
        );

        switch (error.code) {
          case 'P2002':
            // Unique constraint violation
            throw new BadRequestException({
              message: 'A workout log with this data already exists',
              error: 'WorkoutLogAlreadyExists',
            });
          case 'P2025':
            // Record not found during update
            throw new NotFoundException({
              message: `Workout log ${logId} not found`,
              error: 'WorkoutLogNotFound',
            });
          default:
            throw new InternalServerErrorException({
              message: 'Database operation failed',
              error: 'DatabaseError',
            });
        }
      }

      // Handle transaction timeout errors
      if (error instanceof Prisma.PrismaClientUnknownRequestError) {
        this.logger.error(
          `Transaction timeout updating workout log ${logId}: ${error.message}`,
          error.stack,
        );
        throw new InternalServerErrorException({
          message: 'Operation timed out. Please try again.',
          error: 'TransactionTimeout',
        });
      }

      // Re-throw if already a NestJS exception
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      // Generic error handling
      this.logger.error(
        `Failed to update workout log ${logId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to update workout log');
    }
  }

  /**
   * Delete workout log.
   *
   * Security: Verifies user owns the log
   * Cascade: Deletes associated sets automatically (DB CASCADE)
   *
   * @param logId - Workout log ID
   * @param userId - Authenticated user ID
   */
  async deleteWorkoutLog(logId: string, userId: string): Promise<void> {
    try {
      // Verify log exists and ownership
      await this.getLogOrThrow(logId, userId);

      this.logger.log(`Deleting workout log ${logId}`);

      await this.prisma.workoutLog.delete({
        where: { id: logId },
      });

      this.logger.log(`Successfully deleted workout log ${logId}`);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'delete workout log');
    }
  }

  // ==================== PRIVATE HELPER METHODS ====================

  /**
   * Get log or throw appropriate error.
   * Helper to reduce boilerplate.
   */
  private async getLogOrThrow(logId: string, userId: string) {
    try {
      const log = await this.prisma.workoutLog.findUnique({
        where: { id: logId },
      });

      if (!log) {
        throw new NotFoundException({
          message: `Workout log ${logId} not found`,
          error: 'WorkoutLogNotFound',
        });
      }

      if (log.userId !== userId) {
        throw new ForbiddenException({
          message: 'You do not have access to this workout log',
          error: 'WorkoutLogAccessDenied',
        });
      }

      return log;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'get log or throw');
    }
  }

  /**
   * Validate plan/day/item references belong to user.
   *
   * Validates:
   * - If planId provided, user owns the plan
   * - If dayId provided, it belongs to the plan (or exists)
   * - If itemId provided, it belongs to the day (or exists)
   *
   * Throws: NotFoundException or ForbiddenException if invalid
   */
  private async validatePlanReferences(
    userId: string,
    dto: { planId?: string; dayId?: string; itemId?: string },
  ): Promise<void> {
    // Validate plan ownership
    if (dto.planId) {
      const plan = await this.prisma.workoutPlan.findUnique({
        where: { id: dto.planId },
      });

      if (!plan) {
        throw new NotFoundException(`Workout plan ${dto.planId} not found`);
      }

      if (plan.userId !== userId) {
        this.logger.warn(
          `User ${userId} attempted to log workout for plan ${dto.planId} owned by ${plan.userId}`,
        );
        throw new ForbiddenException('You do not have access to this plan');
      }
    }

    // Validate day exists (if provided)
    if (dto.dayId) {
      const day = await this.prisma.workoutDay.findUnique({
        where: { id: dto.dayId },
      });

      if (!day) {
        throw new NotFoundException(`Workout day ${dto.dayId} not found`);
      }

      // If planId also provided, verify day belongs to that plan
      if (dto.planId && day.planId !== dto.planId) {
        throw new BadRequestException(
          `Workout day ${dto.dayId} does not belong to plan ${dto.planId}`,
        );
      }
    }

    // Validate item exists (if provided)
    if (dto.itemId) {
      const item = await this.prisma.workoutItem.findUnique({
        where: { id: dto.itemId },
      });

      if (!item) {
        throw new NotFoundException(`Workout item ${dto.itemId} not found`);
      }

      // If dayId also provided, verify item belongs to that day
      if (dto.dayId && item.dayId !== dto.dayId) {
        throw new BadRequestException(
          `Workout item ${dto.itemId} does not belong to day ${dto.dayId}`,
        );
      }
    }
  }

  /**
   * Upsert sets in transaction.
   *
   * Strategy:
   * - For each set in update array:
   *   - If setNumber exists: UPDATE
   *   - If setNumber doesn't exist: CREATE (append)
   *
   * @param tx - Prisma transaction client
   * @param logId - Workout log ID
   * @param sets - Sets to upsert
   */
  private async upsertSetsInTransaction(
    tx: any,
    logId: string,
    sets: UpdateWorkoutSetDto[],
  ): Promise<void> {
    for (const set of sets) {
      await tx.workoutSet.upsert({
        where: {
          logId_setNumber: {
            logId,
            setNumber: set.setNumber,
          },
        },
        update: {
          ...(set.reps !== undefined && { reps: set.reps }),
          ...(set.weightKg !== undefined && { weightKg: set.weightKg }),
          ...(set.rir !== undefined && { rir: set.rir }),
          ...(set.completed !== undefined && { completed: set.completed }),
        },
        create: {
          logId,
          setNumber: set.setNumber,
          reps: set.reps ?? null,
          weightKg: set.weightKg ?? null,
          rir: set.rir ?? null,
          completed: set.completed ?? true,
        },
      });
    }
  }

  /**
   * Transform Prisma WorkoutLog to response DTO.
   *
   * Uses class-transformer with @Expose() decorators.
   * Handles nested exercise and sets.
   */
  private transformToResponseDto(log: any): WorkoutLogResponseDto {
    return plainToInstance(
      WorkoutLogResponseDto,
      {
        ...log,
        exercise: {
          id: log.exercise.id,
          slug: log.exercise.slug,
          name: log.exercise.name,
          primaryGroup: log.exercise.primaryGroup,
          equipment: log.exercise.equipment,
          instructions: log.exercise.instructions,
          media: log.exercise.media,
        },
        sets: log.sets.map((set: any) => ({
          id: set.id,
          logId: set.logId,
          setNumber: set.setNumber,
          reps: set.reps,
          weightKg: set.weightKg,
          rir: set.rir,
          completed: set.completed,
          createdAt: set.createdAt,
        })),
      },
      { excludeExtraneousValues: true },
    );
  }

  /**
   * Check for personal records and send notifications.
   *
   * PR Detection Logic:
   * 1. Find all previous logs for this exercise by this user
   * 2. For each completed set in current workout:
   *    - Compare weight × reps to all historical sets
   *    - If higher than any previous: PR achieved!
   * 3. Send notification for the best PR (highest weight or most reps)
   *
   * PR Types:
   * - Weight PR: Heaviest weight lifted for given reps
   * - Volume PR: Most reps at given weight
   * - Estimated 1RM PR: Highest calculated one-rep max
   *
   * Error handling:
   * - Failures don't block workout logging (already saved)
   * - Errors logged but not thrown
   *
   * @param userId - User ID
   * @param workoutLog - Just-created workout log with sets
   */
  private async checkForPrAndNotify(
    userId: string,
    workoutLog: any,
  ): Promise<void> {
    try {
      // Only check completed sets with weight and reps
      const completedSets = workoutLog.sets.filter(
        (set: any) => set.completed && set.weightKg && set.reps,
      );

      if (completedSets.length === 0) {
        return;
      }

      // Get all previous workout logs for this exercise
      const previousLogs = await this.prisma.workoutLog.findMany({
        where: {
          userId,
          exerciseId: workoutLog.exerciseId,
          id: { not: workoutLog.id }, // Exclude current log
          performedAt: { lt: workoutLog.performedAt }, // Only past workouts
        },
        include: {
          sets: {
            where: {
              completed: true,
              weightKg: { not: null },
              reps: { not: null },
            },
          },
        },
        orderBy: {
          performedAt: 'desc',
        },
      });

      // Flatten all historical sets
      const historicalSets = previousLogs.flatMap((log) => log.sets);

      if (historicalSets.length === 0) {
        // First time doing this exercise - every set is a PR!
        // Send notification for the best set
        const bestSet = this.findBestSet(completedSets);
        await this.sendPrNotification(
          userId,
          workoutLog.exercise.name,
          bestSet,
          true, // isFirstTime
        );
        return;
      }

      // Check each completed set for PRs
      const prs: any[] = [];

      for (const currentSet of completedSets) {
        const isPr = this.isPrSet(currentSet, historicalSets);
        if (isPr) {
          prs.push(currentSet);
        }
      }

      // If any PRs achieved, send notification for the best one
      if (prs.length > 0) {
        const bestPr = this.findBestSet(prs);
        await this.sendPrNotification(
          userId,
          workoutLog.exercise.name,
          bestPr,
          false,
        );

        this.logger.log(
          `PR achieved for user ${userId}: ${workoutLog.exercise.name} - ${bestPr.weightKg}kg x ${bestPr.reps} reps`,
        );
      }
    } catch (error) {
      // Don't throw - workout logging already succeeded
      this.logger.error(
        `Failed to check for PR: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Determine if a set is a personal record.
   *
   * PR Criteria:
   * - Same or more reps at higher weight
   * - More reps at same weight
   * - Higher estimated 1RM
   *
   * @param currentSet - Set to check
   * @param historicalSets - All previous sets for this exercise
   * @returns True if PR
   */
  private isPrSet(currentSet: any, historicalSets: any[]): boolean {
    const currentWeight = currentSet.weightKg;
    const currentReps = currentSet.reps;

    // Check if any historical set matches or beats current set
    for (const historicalSet of historicalSets) {
      const historicalWeight = historicalSet.weightKg;
      const historicalReps = historicalSet.reps;

      // If historical set has same or more weight AND same or more reps, not a PR
      if (historicalWeight >= currentWeight && historicalReps >= currentReps) {
        return false;
      }

      // If historical set has more weight with same or more reps, not a PR
      if (historicalWeight > currentWeight && historicalReps >= currentReps) {
        return false;
      }

      // If historical set has same weight with more reps, not a PR
      if (historicalWeight === currentWeight && historicalReps > currentReps) {
        return false;
      }
    }

    // No historical set beats this one - it's a PR!
    return true;
  }

  /**
   * Find the "best" set from an array (highest weight, or most reps if tied).
   *
   * @param sets - Array of sets
   * @returns Best set
   */
  private findBestSet(sets: any[]): any {
    return sets.reduce((best, current) => {
      // Prefer higher weight
      if (current.weightKg > best.weightKg) {
        return current;
      }
      // If same weight, prefer more reps
      if (current.weightKg === best.weightKg && current.reps > best.reps) {
        return current;
      }
      return best;
    });
  }

  /**
   * Send PR achievement notification.
   *
   * @param userId - User ID
   * @param exerciseName - Exercise name
   * @param prSet - The PR set
   * @param isFirstTime - Is this the first time doing this exercise?
   */
  private async sendPrNotification(
    userId: string,
    exerciseName: string,
    prSet: any,
    isFirstTime: boolean,
  ): Promise<void> {
    try {
      await this.notificationsService.sendPrAchievedNotification(
        userId,
        exerciseName,
        {
          weight: prSet.weightKg,
          reps: prSet.reps,
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to send PR notification: ${error.message}`,
        error.stack,
      );
      // Don't throw - non-critical
    }
  }
}
