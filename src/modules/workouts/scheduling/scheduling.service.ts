// scheduling/scheduling.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
  Inject,
} from '@nestjs/common';
import { handlePrismaError } from '../../../common/utils/prisma-error.handler';
import { PrismaService } from '../../../prisma/prisma.service';
import { PlannerService, ScheduledAssignment } from './planner.service';
import { ScheduleWeekDto } from '../dtos/schedule-week.dto';
import {
  ScheduledWorkoutResponseDto,
  ScheduleWeekResponseDto,
  UnscheduledDayDto,
} from '../dtos/schedule-workout-response.dto';
import { plainToInstance } from 'class-transformer';
import type { RedisClientType } from 'redis';
import { REDIS_CLIENT } from '../../../common/redis/redis.module';
import { ScheduledWorkoutStatus } from '@prisma/client';

/**
 * Scheduling Service
 *
 * Orchestrates workout schedule generation with database persistence.
 *
 * Responsibilities:
 * - Fetch user's workout plan and availability
 * - Call PlannerService to compute optimal schedule
 * - Persist ScheduledWorkout records to database
 * - Ensure idempotency (safe to regenerate same week)
 * - Use distributed locks to prevent concurrent generation
 * - Validate user permissions and data ownership
 *
 * Design principles:
 * - Orchestration only: delegates algorithm to PlannerService
 * - Transactional: All DB writes succeed or all fail
 * - Idempotent: Can safely regenerate same week multiple times
 * - Distributed-safe: Redis locks prevent race conditions
 * - Rich responses: Includes both success and failure information
 *
 * Dependencies:
 * - PrismaService: Database access
 * - PlannerService: Pure scheduling algorithm
 * - Redis: Distributed locking, caching
 * - Logger: Structured logging
 */
@Injectable()
export class SchedulingService {
  private readonly logger = new Logger(SchedulingService.name);

  /**
   * Lock timeout for schedule generation (30 seconds).
   * If generation takes longer, lock expires and allows retry.
   */
  private readonly LOCK_TTL_MS = 30000;

  /**
   * How long to wait for lock acquisition (5 seconds).
   * If another process holds lock, wait briefly then fail.
   */
  private readonly LOCK_WAIT_MS = 5000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly planner: PlannerService,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClientType,
  ) {}

  /**
   * Generate weekly workout schedule.
   *
   * Flow:
   * 1. Validate inputs (week start date, plan ownership)
   * 2. Acquire distributed lock (prevent concurrent generation)
   * 3. Fetch user's active plan, workout days, availability
   * 4. Call planner algorithm to compute optimal schedule
   * 5. If regenerate=true, delete existing scheduled workouts for this week
   * 6. Persist new ScheduledWorkout records
   * 7. Release lock
   * 8. Return full schedule with nested details
   *
   * Idempotency:
   * - Same week + same plan = same result (if regenerate=true)
   * - If regenerate=false, returns existing schedule without recomputation
   *
   * Concurrency:
   * - Uses Redis lock: lock:schedule:{userId}:{weekKey}
   * - Only one generation per user per week at a time
   * - Prevents duplicate ScheduledWorkout creation
   *
   * @param userId - Authenticated user ID from JWT
   * @param dto - Week to schedule and options
   * @returns Full schedule with scheduled and unscheduled workouts
   */
  async generateWeekSchedule(
    userId: string,
    dto: ScheduleWeekDto,
  ): Promise<ScheduleWeekResponseDto> {
    let lockKey: string | null = null;
    let lockValue: string | null = null;

    try {
      // Parse and validate week start date
      const weekStart = this.parseAndValidateWeekStart(dto.weekStart);
      const weekKey = this.getWeekKey(weekStart);

      this.logger.log(
        `Generating schedule for user ${userId}, week ${weekKey}, regenerate=${dto.regenerate}`,
      );

      // Acquire distributed lock to prevent concurrent generation
      lockKey = `lock:schedule:${userId}:${weekKey}`;
      lockValue = `${Date.now()}`; // Unique value for this lock holder
      const lockAcquired = await this.acquireLock(lockKey, lockValue);

      if (!lockAcquired) {
        throw new BadRequestException({
          message: 'Schedule generation already in progress for this week. Please try again in a moment.',
          error: 'ScheduleGenerationInProgress',
        });
      }
      // Check if week already scheduled
      if (!dto.regenerate) {
        const existingSchedule = await this.getExistingSchedule(
          userId,
          weekStart,
        );
        if (existingSchedule.length > 0) {
          this.logger.log(
            `Week ${weekKey} already scheduled (${existingSchedule.length} workouts), returning existing`,
          );
          return this.buildScheduleResponse(
            dto.weekStart,
            existingSchedule,
            [],
            existingSchedule.length,
          );
        }
      }

      // Fetch user's active plan (or specific plan if provided)
      const plan = await this.getUserPlan(userId, dto.planId);

      if (!plan) {
        throw new NotFoundException({
          message: 'No active workout plan found for user',
          error: 'PlanNotFound',
        });
      }

      // Fetch workout days for this week
      const workoutDays = await this.getWorkoutDaysForWeek(plan.id, weekStart);

      if (workoutDays.length === 0) {
        this.logger.warn(`Plan ${plan.id} has no workout days to schedule`);
        return this.buildScheduleResponse(dto.weekStart, [], [], 0);
      }

      // Fetch user's availability windows
      const availabilityWindows = await this.getUserAvailability(userId);

      // Fetch existing scheduled workouts in this week (for overlap detection)
      const existingScheduled = await this.getExistingSchedule(
        userId,
        weekStart,
      );

      // Call planner to compute optimal schedule
      const planResult = this.planner.scheduleWeek(
        workoutDays.map((day) => ({
          id: day.id,
          planId: day.planId,
          weekNumber: day.weekNumber,
          dayNumber: day.dayNumber,
          focus: day.focus,
          items: day.items.map((item) => ({
            targetSets: item.targetSets,
            targetReps: item.targetReps ?? undefined,
            restSec: item.restSec ?? undefined,
          })),
        })),
        availabilityWindows.map((w) => ({
          dayOfWeek: w.dayOfWeek,
          startMin: w.startMin,
          endMin: w.endMin,
          priority: w.priority,
        })),
        weekStart,
        existingScheduled.map((s) => ({
          scheduledAt: s.scheduledAt,
          estimatedDurationMin: this.planner.estimateWorkoutDuration({
            id: s.dayId || '',
            planId: s.planId || '',
            weekNumber: 0,
            dayNumber: 0,
            focus: 'mixed',
            items: [],
          }),
        })),
      );

      // Persist scheduled workouts to database
      let persistedScheduled: any[] = [];

      if (planResult.scheduled.length > 0) {
        persistedScheduled = await this.persistScheduledWorkouts(
          userId,
          planResult.scheduled,
          dto.regenerate || false,
          weekStart,
        );
      }

      this.logger.log(
        `Successfully scheduled ${persistedScheduled.length}/${workoutDays.length} workouts for week ${weekKey}`,
      );

      return this.buildScheduleResponse(
        dto.weekStart,
        persistedScheduled,
        planResult.unscheduled,
        workoutDays.length,
      );
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      return handlePrismaError(error, this.logger, 'generate week schedule');
    } finally {
      // Always release lock if acquired
      if (lockKey && lockValue) {
        await this.releaseLock(lockKey, lockValue);
      }
    }
  }

  /**
   * Get scheduled workouts for a specific week.
   *
   * @param userId - User ID from JWT
   * @param weekStart - Week start date (ISO string)
   * @param planId - Optional: filter by specific plan
   * @param status - Optional: filter by status
   * @returns Array of scheduled workouts with nested details
   */
  async getWeekSchedule(
    userId: string,
    weekStart?: string,
    planId?: string,
    status?: ScheduledWorkoutStatus,
  ): Promise<ScheduledWorkoutResponseDto[]> {
    try {
      // Default to current week if not provided
      const startDate = weekStart
        ? this.parseAndValidateWeekStart(weekStart)
        : this.getCurrentWeekStart();

      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 7);

      const scheduledWorkouts = await this.prisma.scheduledWorkout.findMany({
        where: {
          userId,
          scheduledAt: {
            gte: startDate,
            lt: endDate,
          },
          ...(planId && { planId }),
          ...(status && { status }),
        },
        include: {
          plan: true,
          day: {
            include: {
              items: {
                include: {
                  exercise: true,
                },
                orderBy: {
                  order: 'asc',
                },
              },
            },
          },
        },
        orderBy: {
          scheduledAt: 'asc',
        },
      });

      return scheduledWorkouts.map((sw) => this.transformToResponseDto(sw));
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'get week schedule');
    }
  }

  /**
   * Get next upcoming scheduled workout.
   *
   * @param userId - User ID from JWT
   * @returns Next scheduled workout or null if none exist
   */
  async getUpcomingWorkout(
    userId: string,
  ): Promise<ScheduledWorkoutResponseDto | null> {
    try {
      const now = new Date();

      const nextWorkout = await this.prisma.scheduledWorkout.findFirst({
        where: {
          userId,
          scheduledAt: { gte: now },
          status: 'scheduled',
        },
        include: {
          plan: true,
          day: {
            include: {
              items: {
                include: {
                  exercise: true,
                },
                orderBy: {
                  order: 'asc',
                },
              },
            },
          },
        },
        orderBy: {
          scheduledAt: 'asc',
        },
      });

      if (!nextWorkout) {
        return null;
      }

      return this.transformToResponseDto(nextWorkout);
    } catch (error) {
      handlePrismaError(error, this.logger, 'get upcoming workout');
    }
  }

  /**
   * Cancel a scheduled workout.
   *
   * Security: Verifies user owns the scheduled workout
   *
   * @param userId - User ID from JWT
   * @param scheduledWorkoutId - ID of workout to cancel
   */
  async cancelScheduledWorkout(
    userId: string,
    scheduledWorkoutId: string,
  ): Promise<void> {
    try {
      const workout = await this.prisma.scheduledWorkout.findUnique({
        where: { id: scheduledWorkoutId },
      });

      if (!workout) {
        throw new NotFoundException({
          message: 'Scheduled workout not found',
          error: 'WorkoutNotFound',
        });
      }

      if (workout.userId !== userId) {
        this.logger.warn(
          `User ${userId} attempted to cancel workout ${scheduledWorkoutId} owned by ${workout.userId}`,
        );
        throw new ForbiddenException({
          message: 'You do not have access to this workout',
          error: 'WorkoutAccessDenied',
        });
      }

      this.logger.log(`Cancelling scheduled workout ${scheduledWorkoutId} for user ${userId}`);

      await this.prisma.scheduledWorkout.update({
        where: { id: scheduledWorkoutId },
        data: {
          status: 'cancelled',
        },
      });

      this.logger.log(`Successfully cancelled scheduled workout ${scheduledWorkoutId}`);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'cancel scheduled workout');
    }
  }

  // ==================== PRIVATE HELPER METHODS ====================

  /**
   * Parse week start date string and validate it's valid.
   *
   * Validation:
   * - Must be valid ISO date string
   * - Service doesn't enforce Monday (flexible for different week starts)
   * - Normalizes to midnight in user's timezone
   *
   * @param weekStartStr - ISO date string (YYYY-MM-DD)
   * @returns Date object at midnight
   */
  private parseAndValidateWeekStart(weekStartStr: string): Date {
    const date = new Date(weekStartStr);

    if (isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid week start date: ${weekStartStr}`);
    }

    // Normalize to midnight
    date.setHours(0, 0, 0, 0);

    return date;
  }

  /**
   * Get current week start (Monday of current week).
   *
   * @returns Date object for this Monday at midnight
   */
  private getCurrentWeekStart(): Date {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sunday
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);

    return monday;
  }

  /**
   * Generate week key for locking and logging (YYYY-WW format).
   *
   * @param weekStart - Week start date
   * @returns Week key string (e.g., "2025-03")
   */
  private getWeekKey(weekStart: Date): string {
    const year = weekStart.getFullYear();
    const weekNumber = this.getWeekNumber(weekStart);
    return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
  }

  /**
   * Calculate ISO week number.
   *
   * @param date - Date to calculate week for
   * @returns Week number (1-53)
   */
  private getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear =
      (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  /**
   * Get user's active workout plan or specific plan by ID.
   *
   * @param userId - User ID
   * @param planId - Optional: specific plan ID
   * @returns WorkoutPlan or null if not found
   * @throws ForbiddenException if user doesn't own the plan
   */
  private async getUserPlan(userId: string, planId?: string) {
    try {
      if (planId) {
        // Fetch specific plan
        const plan = await this.prisma.workoutPlan.findUnique({
          where: { id: planId },
        });

        if (!plan) {
          throw new NotFoundException({
            message: `Workout plan ${planId} not found`,
            error: 'PlanNotFound',
          });
        }

        if (plan.userId !== userId) {
          this.logger.warn(
            `User ${userId} attempted to access plan ${planId} owned by ${plan.userId}`,
          );
          throw new ForbiddenException({
            message: 'You do not have access to this plan',
            error: 'PlanAccessDenied',
          });
        }

        return plan;
      }

      // Fetch active plan
      const plan = await this.prisma.workoutPlan.findFirst({
        where: {
          userId,
          status: 'active',
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return plan;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'get user plan');
    }
  }

  /**
   * Get workout days that should be scheduled in this week.
   *
   * Logic:
   * - Calculate which week number in the plan this calendar week corresponds to
   * - Fetch all WorkoutDays for that week number
   * - Include nested items (exercises) for duration estimation
   *
   * @param planId - Workout plan ID
   * @param weekStart - Start of week to schedule
   * @returns Array of WorkoutDay with items
   */
  private async getWorkoutDaysForWeek(planId: string, weekStart: Date) {
    // For MVP: Schedule all days in the plan for this week
    // Future: Calculate plan week number based on plan.createdAt
    // For now: Get days for week 1 of the plan
    // TODO: Implement proper week number calculation based on plan start date

    const workoutDays = await this.prisma.workoutDay.findMany({
      where: {
        planId,
        // For MVP: just get first week's days
        // In production: calculate which plan week number this calendar week maps to
        weekNumber: 1,
      },
      include: {
        items: {
          include: {
            exercise: true,
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
      orderBy: {
        dayNumber: 'asc',
      },
    });

    return workoutDays;
  }

  /**
   * Get user's availability windows.
   *
   * @param userId - User ID
   * @returns Array of availability windows
   */
  private async getUserAvailability(userId: string) {
    const windows = await this.prisma.availabilityWindow.findMany({
      where: { userId },
      orderBy: [
        { priority: 'desc' },
        { dayOfWeek: 'asc' },
        { startMin: 'asc' },
      ],
    });

    return windows;
  }

  /**
   * Get existing scheduled workouts for a week.
   *
   * Used for:
   * - Checking if week already scheduled
   * - Overlap detection when regenerating
   *
   * @param userId - User ID
   * @param weekStart - Start of week
   * @returns Array of scheduled workouts in this week
   */
  private async getExistingSchedule(userId: string, weekStart: Date) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const scheduled = await this.prisma.scheduledWorkout.findMany({
      where: {
        userId,
        scheduledAt: {
          gte: weekStart,
          lt: weekEnd,
        },
      },
      include: {
        plan: true,
        day: {
          include: {
            items: {
              include: {
                exercise: true,
              },
              orderBy: {
                order: 'asc',
              },
            },
          },
        },
      },
      orderBy: {
        scheduledAt: 'asc',
      },
    });

    return scheduled;
  }

  /**
   * Persist scheduled workouts to database.
   *
   * Transaction:
   * - If regenerate=true: delete existing, then insert new
   * - If regenerate=false: only insert new (no deletes)
   *
   * @param userId - User ID
   * @param assignments - Scheduled assignments from planner
   * @param regenerate - Whether to delete existing first
   * @param weekStart - Week start date
   * @returns Persisted scheduled workouts with full details
   */
  private async persistScheduledWorkouts(
    userId: string,
    assignments: ScheduledAssignment[],
    regenerate: boolean,
    weekStart: Date,
  ) {
    try {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      return await this.prisma.$transaction(async (tx) => {
        // If regenerate, delete existing scheduled workouts for this week
        if (regenerate) {
          const deleted = await tx.scheduledWorkout.deleteMany({
            where: {
              userId,
              scheduledAt: {
                gte: weekStart,
                lt: weekEnd,
              },
              status: 'scheduled', // Only delete not-yet-started workouts
            },
          });

          this.logger.log(`Deleted ${deleted.count} existing scheduled workouts`);
        }

        // Insert new scheduled workouts
        await tx.scheduledWorkout.createMany({
          data: assignments.map((a) => ({
            userId,
            planId: a.planId,
            dayId: a.dayId,
            scheduledAt: a.scheduledAt,
            status: 'scheduled',
          })),
        });

        // Fetch created workouts with full details
        const created = await tx.scheduledWorkout.findMany({
          where: {
            userId,
            scheduledAt: {
              gte: weekStart,
              lt: weekEnd,
            },
          },
          include: {
            plan: true,
            day: {
              include: {
                items: {
                  include: {
                    exercise: true,
                  },
                  orderBy: {
                    order: 'asc',
                  },
                },
              },
            },
          },
          orderBy: {
            scheduledAt: 'asc',
          },
        });

        return created;
      });
    } catch (error) {
      handlePrismaError(error, this.logger, 'persist scheduled workouts');
    }
  }

  /**
   * Build ScheduleWeekResponseDto from persisted data.
   *
   * @param weekStart - Week start ISO string
   * @param scheduled - Persisted scheduled workouts
   * @param unscheduled - Days that couldn't be scheduled
   * @param totalDays - Total workout days in plan for this week
   * @returns Complete response DTO
   */
  private buildScheduleResponse(
    weekStart: string,
    scheduled: any[],
    unscheduled: any[],
    totalDays: number,
  ): ScheduleWeekResponseDto {
    return {
      weekStart,
      scheduled: scheduled.map((sw) => this.transformToResponseDto(sw)),
      unscheduled: unscheduled.map((u) =>
        plainToInstance(UnscheduledDayDto, u, {
          excludeExtraneousValues: true,
        }),
      ),
      summary: {
        totalDays,
        scheduledCount: scheduled.length,
        unscheduledCount: unscheduled.length,
      },
    };
  }

  /**
   * Transform Prisma ScheduledWorkout to DTO.
   *
   * Uses class-transformer with @Expose() decorators.
   * Handles nested plan and day details.
   */
  private transformToResponseDto(
    scheduledWorkout: any,
  ): ScheduledWorkoutResponseDto {
    return plainToInstance(
      ScheduledWorkoutResponseDto,
      {
        ...scheduledWorkout,
        plan: scheduledWorkout.plan
          ? {
              id: scheduledWorkout.plan.id,
              title: scheduledWorkout.plan.title,
              status: scheduledWorkout.plan.status,
              weeks: scheduledWorkout.plan.weeks,
            }
          : null,
        day: scheduledWorkout.day
          ? {
              id: scheduledWorkout.day.id,
              weekNumber: scheduledWorkout.day.weekNumber,
              dayNumber: scheduledWorkout.day.dayNumber,
              focus: scheduledWorkout.day.focus,
              notes: scheduledWorkout.day.notes,
              items: scheduledWorkout.day.items.map((item: any) => ({
                id: item.id,
                order: item.order,
                exerciseId: item.exerciseId,
                exercise: {
                  id: item.exercise.id,
                  slug: item.exercise.slug,
                  name: item.exercise.name,
                  primaryGroup: item.exercise.primaryGroup,
                  equipment: item.exercise.equipment,
                  instructions: item.exercise.instructions,
                  media: item.exercise.media,
                },
                targetSets: item.targetSets,
                targetReps: item.targetReps,
                targetRir: item.targetRir,
                targetWeight: item.targetWeight,
                tempo: item.tempo,
                restSec: item.restSec,
              })),
            }
          : null,
      },
      { excludeExtraneousValues: true },
    );
  }

  /**
   * Acquire distributed lock using Redis.
   *
   * Uses SET with NX and PX options (node-redis v5 syntax):
   * - NX: Only set if key doesn't exist
   * - PX: Set TTL in milliseconds
   *
   * @param key - Lock key
   * @param value - Unique value for this lock holder
   * @returns true if lock acquired, false if already held
   */
  private async acquireLock(key: string, value: string): Promise<boolean> {
    try {
      const result = await this.redis.set(key, value, {
        NX: true,
        PX: this.LOCK_TTL_MS,
      });
      return result === 'OK';
    } catch (error) {
      this.logger.error(`Failed to acquire lock ${key}`, error);
      return false;
    }
  }

  /**
   * Release distributed lock.
   *
   * Only releases if this process owns the lock (value matches).
   * Prevents accidentally releasing another process's lock.
   *
   * @param key - Lock key
   * @param value - Lock value set by this process
   */
  private async releaseLock(key: string, value: string): Promise<void> {
    try {
      // Lua script ensures atomic check-and-delete
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      await this.redis.eval(script, {
        keys: [key],
        arguments: [value],
      });
    } catch (error) {
      this.logger.error(`Failed to release lock ${key}`, error);
      // Don't throw - lock will expire anyway
    }
  }
}
