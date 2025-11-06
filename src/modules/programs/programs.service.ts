import { Injectable, NotFoundException, ForbiddenException, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { handlePrismaError } from '../../common/utils/prisma-error.handler';
import { CreateProgramDto } from './dto/create-program.dto';
import { UpdateProgramDto } from './dto/update-program.dto';
import { UpdateProgramStatusDto } from './dto/update-program-status.dto';
import { CreateWorkoutDayDto } from './dto/create-workout-day.dto';
import { UpdateWorkoutDayDto } from './dto/update-workout-day.dto';
import { CreateWorkoutItemDto } from './dto/create-workout-item.dto';
import { UpdateWorkoutItemDto } from './dto/update-workout-item.dto';
import { PlanStatus } from '@prisma/client';

/**
 * Programs Service
 * 
 * Handles all business logic for workout programs (plans), workout days, and workout items.
 * 
 * Design principles:
 * - Hierarchical structure: Program → Days → Items
 * - Ownership validation: Users can only access their own programs
 * - Transactional cloning: Ensure complete copy or rollback
 * - Exercise validation: Verify exercises exist before adding to workouts
 * - Flexible structure: No restrictions on day/item arrangements
 * 
 * Business rules:
 * - Programs start in 'draft' status
 * - Days are identified by (planId, weekNumber, dayNumber)
 * - Items are ordered within each day
 * - Cloning creates complete deep copy (plan + days + items)
 */
@Injectable()
export class ProgramsService {
  private readonly logger = new Logger(ProgramsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  // ==================== PROGRAM CRUD ====================

  /**
   * Create a new workout program
   *
   * Flow:
   * 1. Create program with status='draft'
   * 2. Days and items added via separate endpoints
   *
   * Default status: draft (user activates when ready)
   * Default weeks: 4 if not specified
   */
  async createProgram(userId: string, dto: CreateProgramDto) {
    try {
      this.logger.log(`Creating program for user ${userId}: ${dto.title}`);

      const program = await this.prisma.workoutPlan.create({
        data: {
          userId,
          title: dto.title,
          weeks: dto.weeks || 4,
          status: PlanStatus.draft,
          sourceJson: dto.sourceJson ?? Prisma.DbNull,
        },
      });

      this.logger.log(`Successfully created program ${program.id}`);
      return program;
    } catch (error) {
      handlePrismaError(error, this.logger, 'create program');
    }
  }

  /**
   * Get all programs for a user
   *
   * Optional status filter (e.g., only show active programs)
   * Ordered by creation date (newest first)
   * Includes count of days for quick overview
   */
  async getUserPrograms(userId: string, status?: PlanStatus) {
    try {
      return this.prisma.workoutPlan.findMany({
        where: {
          userId,
          ...(status && { status }),
        },
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { days: true },
          },
        },
      });
    } catch (error) {
      handlePrismaError(error, this.logger, 'get user programs');
    }
  }

  /**
   * Get a specific program by ID with full details
   *
   * Returns complete hierarchy: Program → Days → Items → Exercises
   *
   * Flow:
   * 1. Find program
   * 2. Verify ownership
   * 3. Include all nested data (days, items, exercise details)
   */
  async getProgramById(userId: string, programId: string) {
    try {
      const program = await this.prisma.workoutPlan.findUnique({
        where: { id: programId },
        include: {
          days: {
            orderBy: [
              { weekNumber: 'asc' },
              { dayNumber: 'asc' },
            ],
            include: {
              items: {
                orderBy: { order: 'asc' },
                include: {
                  exercise: {
                    select: {
                      id: true,
                      slug: true,
                      name: true,
                      primaryGroup: true,
                      equipment: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!program) {
        throw new NotFoundException({
          message: 'Program not found',
          error: 'ProgramNotFound',
        });
      }

      if (program.userId !== userId) {
        throw new ForbiddenException({
          message: 'You do not have access to this program',
          error: 'ProgramAccessDenied',
        });
      }

      return program;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'get program by id');
    }
  }

  /**
   * Update program details
   *
   * Only updates provided fields
   * Status updates use separate endpoint
   */
  async updateProgram(userId: string, programId: string, dto: UpdateProgramDto) {
    try {
      // Verify ownership
      await this.getProgramById(userId, programId);

      this.logger.log(`Updating program ${programId}`);

      const program = await this.prisma.workoutPlan.update({
        where: { id: programId },
        data: {
          title: dto.title,
          weeks: dto.weeks,
          sourceJson: dto.sourceJson,
        },
      });

      this.logger.log(`Successfully updated program ${programId}`);
      return program;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'update program');
    }
  }

  /**
   * Update program status
   *
   * Status transitions:
   * - draft → active (ready to use)
   * - active → archived (completed or deprecated)
   * - archived → active (reactivate old program)
   */
  async updateProgramStatus(userId: string, programId: string, dto: UpdateProgramStatusDto) {
    try {
      // Verify ownership
      await this.getProgramById(userId, programId);

      this.logger.log(`Updating program status ${programId} to ${dto.status}`);

      const program = await this.prisma.workoutPlan.update({
        where: { id: programId },
        data: { status: dto.status },
      });

      this.logger.log(`Successfully updated program status ${programId}`);
      return program;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'update program status');
    }
  }

  /**
   * Delete a program
   *
   * Cascade delete: Removes all days and items (defined in Prisma schema)
   * Use with caution - no soft delete
   */
  async deleteProgram(userId: string, programId: string) {
    try {
      // Verify ownership
      await this.getProgramById(userId, programId);

      this.logger.log(`Deleting program ${programId}`);

      await this.prisma.workoutPlan.delete({
        where: { id: programId },
      });

      this.logger.log(`Successfully deleted program ${programId}`);
      return { message: 'Program deleted successfully' };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'delete program');
    }
  }

  /**
   * Clone an existing program
   * 
   * Creates complete deep copy: Program → Days → Items
   * 
   * Flow:
   * 1. Verify ownership of source program
   * 2. Create new program with same structure
   * 3. Clone all days
   * 4. Clone all items for each day
   * 5. Transaction ensures all-or-nothing
   * 
   * Use cases:
   * - Repeat successful program
   * - Create variations of existing program
   * - Share program template (future feature)
   * 
   * Design: New program starts as 'draft' with title suffix " (Copy)"
   */
  async cloneProgram(userId: string, sourceProgramId: string) {
    // Verify ownership and get full program structure
    const sourceProgram = await this.getProgramById(userId, sourceProgramId);

    // Get transaction configuration - use longRunning config for deep cloning
    const txConfig = this.configService.get('transaction.longRunning') || {
      maxWait: 5000,
      timeout: 15000,
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    };

    try {
      // Clone in transaction (all-or-nothing) with proper error handling
      const clonedProgram = await this.prisma.$transaction(async (tx) => {
        // Create new program
        const newProgram = await tx.workoutPlan.create({
          data: {
            userId,
            title: `${sourceProgram.title} (Copy)`,
            weeks: sourceProgram.weeks,
            status: PlanStatus.draft,
            sourceJson: sourceProgram.sourceJson ?? Prisma.DbNull,
          },
        });

        // Clone all days
        for (const day of sourceProgram.days) {
          const newDay = await tx.workoutDay.create({
            data: {
              planId: newProgram.id,
              weekNumber: day.weekNumber,
              dayNumber: day.dayNumber,
              focus: day.focus,
              notes: day.notes,
            },
          });

          // Clone all items for this day
          for (const item of day.items) {
            await tx.workoutItem.create({
              data: {
                dayId: newDay.id,
                order: item.order,
                exerciseId: item.exerciseId,
                targetSets: item.targetSets,
                targetReps: item.targetReps,
                targetRir: item.targetRir,
                targetWeight: item.targetWeight,
                restSec: item.restSec,
                notes: item.notes,
              },
            });
          }
        }

        return newProgram;
      }, txConfig);

      // Return full cloned program with all nested data
      return this.getProgramById(userId, clonedProgram.id);
    } catch (error) {
      // Handle Prisma-specific errors
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        switch (error.code) {
          case 'P2002':
            // Unique constraint violation
            throw new BadRequestException({
              message: 'A program with this data already exists',
              error: 'ProgramAlreadyExists',
            });
          case 'P2003':
            // Foreign key constraint violation
            throw new BadRequestException({
              message: 'Invalid reference to exercise or other entity',
              error: 'InvalidForeignKey',
            });
          case 'P2025':
            // Record not found
            throw new NotFoundException({
              message: 'Source program or related entity not found',
              error: 'RecordNotFound',
            });
          default:
            throw new InternalServerErrorException({
              message: 'Database operation failed while cloning program',
              error: 'DatabaseError',
            });
        }
      }

      // Handle transaction timeout errors
      if (error instanceof Prisma.PrismaClientUnknownRequestError) {
        throw new InternalServerErrorException({
          message: 'Operation timed out. The program may be too large to clone. Please try again.',
          error: 'TransactionTimeout',
        });
      }

      // Re-throw if already a NestJS exception
      if (error instanceof BadRequestException || error instanceof NotFoundException || error instanceof InternalServerErrorException) {
        throw error;
      }

      // Generic error handling
      throw new InternalServerErrorException('Failed to clone program');
    }
  }

  // ==================== WORKOUT DAY CRUD ====================

  /**
   * Add a workout day to a program
   *
   * Flow:
   * 1. Verify program ownership
   * 2. Check for duplicate (weekNumber + dayNumber) - Prisma enforces uniqueness
   * 3. Create day
   *
   * Note: No overlap validation (users may want multiple sessions per day)
   */
  async createWorkoutDay(userId: string, programId: string, dto: CreateWorkoutDayDto) {
    try {
      // Verify ownership
      await this.getProgramById(userId, programId);

      // Validate weekNumber doesn't exceed program weeks
      const program = await this.prisma.workoutPlan.findUnique({
        where: { id: programId },
        select: { weeks: true },
      });

      if (dto.weekNumber > program!.weeks) {
        throw new BadRequestException({
          message: `Week number ${dto.weekNumber} exceeds program duration of ${program!.weeks} weeks`,
          error: 'InvalidWeekNumber',
        });
      }

      this.logger.log(`Creating workout day for program ${programId}: week ${dto.weekNumber}, day ${dto.dayNumber}`);

      const day = await this.prisma.workoutDay.create({
        data: {
          planId: programId,
          weekNumber: dto.weekNumber,
          dayNumber: dto.dayNumber,
          focus: dto.focus,
          notes: dto.notes,
        },
        include: {
          items: {
            orderBy: { order: 'asc' },
            include: {
              exercise: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                  primaryGroup: true,
                  equipment: true,
                },
              },
            },
          },
        },
      });

      this.logger.log(`Successfully created workout day ${day.id}`);
      return day;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException || error instanceof BadRequestException) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'create workout day');
    }
  }

  /**
   * Update a workout day
   *
   * Note: weekNumber and dayNumber are NOT updatable (would break uniqueness)
   * To move a day, delete and recreate
   */
  async updateWorkoutDay(userId: string, programId: string, dayId: string, dto: UpdateWorkoutDayDto) {
    try {
      // Verify ownership
      await this.getProgramById(userId, programId);

      // Verify day belongs to program
      const day = await this.prisma.workoutDay.findUnique({
        where: { id: dayId },
      });

      if (!day || day.planId !== programId) {
        throw new NotFoundException({
          message: 'Workout day not found',
          error: 'WorkoutDayNotFound',
        });
      }

      this.logger.log(`Updating workout day ${dayId}`);

      const updatedDay = await this.prisma.workoutDay.update({
        where: { id: dayId },
        data: {
          focus: dto.focus,
          notes: dto.notes,
        },
      });

      this.logger.log(`Successfully updated workout day ${dayId}`);
      return updatedDay;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'update workout day');
    }
  }

  /**
   * Delete a workout day
   *
   * Cascade delete: Removes all items (defined in Prisma schema)
   */
  async deleteWorkoutDay(userId: string, programId: string, dayId: string) {
    try {
      // Verify ownership
      await this.getProgramById(userId, programId);

      // Verify day belongs to program
      const day = await this.prisma.workoutDay.findUnique({
        where: { id: dayId },
      });

      if (!day || day.planId !== programId) {
        throw new NotFoundException({
          message: 'Workout day not found',
          error: 'WorkoutDayNotFound',
        });
      }

      this.logger.log(`Deleting workout day ${dayId}`);

      await this.prisma.workoutDay.delete({
        where: { id: dayId },
      });

      this.logger.log(`Successfully deleted workout day ${dayId}`);
      return { message: 'Workout day deleted successfully' };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'delete workout day');
    }
  }

  // ==================== WORKOUT ITEM CRUD ====================

  /**
   * Add an exercise item to a workout day
   *
   * Flow:
   * 1. Verify program ownership
   * 2. Verify day exists and belongs to program
   * 3. Verify exercise exists
   * 4. Create item
   */
  async createWorkoutItem(userId: string, programId: string, dayId: string, dto: CreateWorkoutItemDto) {
    try {
      // Verify ownership
      await this.getProgramById(userId, programId);

      // Verify day belongs to program
      const day = await this.prisma.workoutDay.findUnique({
        where: { id: dayId },
      });

      if (!day || day.planId !== programId) {
        throw new NotFoundException({
          message: 'Workout day not found',
          error: 'WorkoutDayNotFound',
        });
      }

      // Verify exercise exists
      const exercise = await this.prisma.exercise.findUnique({
        where: { id: dto.exerciseId },
      });

      if (!exercise) {
        throw new NotFoundException({
          message: 'Exercise not found',
          error: 'ExerciseNotFound',
        });
      }

      this.logger.log(`Creating workout item for day ${dayId}: exercise ${dto.exerciseId}`);

      const item = await this.prisma.workoutItem.create({
        data: {
          dayId,
          order: dto.order,
          exerciseId: dto.exerciseId,
          targetSets: dto.targetSets,
          targetReps: dto.targetReps,
          targetRir: dto.targetRir,
          targetWeight: dto.targetWeight,
          restSec: dto.restSeconds,
          notes: dto.notes,
        },
        include: {
          exercise: {
            select: {
              id: true,
              slug: true,
              name: true,
              primaryGroup: true,
              equipment: true,
            },
          },
        },
      });

      this.logger.log(`Successfully created workout item ${item.id}`);
      return item;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'create workout item');
    }
  }

  /**
   * Update a workout item
   *
   * Note: exerciseId is NOT updatable (would change the exercise entirely)
   * To change exercise, delete item and create new one
   */
  async updateWorkoutItem(
    userId: string,
    programId: string,
    dayId: string,
    itemId: string,
    dto: UpdateWorkoutItemDto,
  ) {
    try {
      // Verify ownership
      await this.getProgramById(userId, programId);

      // Verify day belongs to program
      const day = await this.prisma.workoutDay.findUnique({
        where: { id: dayId },
      });

      if (!day || day.planId !== programId) {
        throw new NotFoundException({
          message: 'Workout day not found',
          error: 'WorkoutDayNotFound',
        });
      }

      // Verify item belongs to day
      const item = await this.prisma.workoutItem.findUnique({
        where: { id: itemId },
      });

      if (!item || item.dayId !== dayId) {
        throw new NotFoundException({
          message: 'Workout item not found',
          error: 'WorkoutItemNotFound',
        });
      }

      this.logger.log(`Updating workout item ${itemId}`);

      const updatedItem = await this.prisma.workoutItem.update({
        where: { id: itemId },
        data: {
          order: dto.order,
          targetSets: dto.targetSets,
          targetReps: dto.targetReps,
          targetRir: dto.targetRir,
          targetWeight: dto.targetWeight,
          restSec: dto.restSeconds,
          notes: dto.notes,
        },
        include: {
          exercise: {
            select: {
              id: true,
              slug: true,
              name: true,
              primaryGroup: true,
              equipment: true,
            },
          },
        },
      });

      this.logger.log(`Successfully updated workout item ${itemId}`);
      return updatedItem;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'update workout item');
    }
  }

  /**
   * Delete a workout item
   */
  async deleteWorkoutItem(userId: string, programId: string, dayId: string, itemId: string) {
    try {
      // Verify ownership
      await this.getProgramById(userId, programId);

      // Verify day belongs to program
      const day = await this.prisma.workoutDay.findUnique({
        where: { id: dayId },
      });

      if (!day || day.planId !== programId) {
        throw new NotFoundException({
          message: 'Workout day not found',
          error: 'WorkoutDayNotFound',
        });
      }

      // Verify item belongs to day
      const item = await this.prisma.workoutItem.findUnique({
        where: { id: itemId },
      });

      if (!item || item.dayId !== dayId) {
        throw new NotFoundException({
          message: 'Workout item not found',
          error: 'WorkoutItemNotFound',
        });
      }

      this.logger.log(`Deleting workout item ${itemId}`);

      await this.prisma.workoutItem.delete({
        where: { id: itemId },
      });

      this.logger.log(`Successfully deleted workout item ${itemId}`);
      return { message: 'Workout item deleted successfully' };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'delete workout item');
    }
  }
}