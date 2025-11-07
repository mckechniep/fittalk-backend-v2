import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { UpdateGoalStatusDto } from './dto/update-goal-status.dto';
import { GoalStatus } from '@prisma/client';
import { handlePrismaError } from '../../common/utils/prisma-error.handler';

/**
 * Goals Service
 * 
 * Handles all business logic for user fitness goals.
 * 
 * Design principles:
 * - Ownership validation: Users can only access their own goals
 * - Flexible goal creation: Minimal required fields for quick setup
 * - Status lifecycle: Clear transitions between active/paused/achieved/abandoned
 * - Optional plan linking: Goals can exist independently or be linked to workout plans
 * 
 * Business rules:
 * - Goals are user-scoped (no shared goals)
 * - Soft delete not implemented (hard delete for simplicity)
 * - Plan linking is optional and can be added/removed anytime
 */
@Injectable()
export class GoalsService {
  private readonly logger = new Logger(GoalsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new goal
   * 
   * Flow:
   * 1. Validate planId exists if provided
   * 2. Create goal record
   * 3. Return goal with optional plan details
   * 
   * Default status: active
   */
  async createGoal(userId: string, dto: CreateGoalDto) {
    try {
      // If planId provided, verify it exists and belongs to user
      if (dto.planId) {
        const plan = await this.prisma.workoutPlan.findUnique({
          where: { id: dto.planId },
        });

        if (!plan || plan.userId !== userId) {
          throw new NotFoundException({
            message: 'Workout plan not found',
            error: 'PlanNotFound',
          });
        }
      }

      this.logger.log(`Creating goal for user ${userId}: ${dto.type}`);

      const goal = await this.prisma.userGoal.create({
        data: {
          userId,
          type: dto.type,
          description: dto.description,
          targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
          startWeightKg: dto.startWeightKg,
          targetWeightKg: dto.targetWeightKg,
          status: GoalStatus.active,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      this.logger.log(`Successfully created goal ${goal.id}`);
      return goal;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'create goal');
    }
  }

  /**
   * Get all goals for a user
   * 
   * Optional status filter for frontend (e.g., show only active goals)
   * Ordered by creation date (newest first)
   */
  async getUserGoals(userId: string, status?: GoalStatus) {
    try {
      return await this.prisma.userGoal.findMany({
        where: {
          userId,
          ...(status && { status }),
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          description: true,
          targetDate: true,
          startWeightKg: true,
          targetWeightKg: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (error) {
      handlePrismaError(error, this.logger, 'get user goals');
    }
  }

  /**
   * Get a specific goal by ID
   * 
   * Flow:
   * 1. Find goal
   * 2. Verify ownership
   * 3. Return with optional plan details
   */
  async getGoalById(userId: string, goalId: string) {
    try {
      const goal = await this.prisma.userGoal.findUnique({
        where: { id: goalId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      if (!goal) {
        throw new NotFoundException({
          message: 'Goal not found',
          error: 'GoalNotFound',
        });
      }

      if (goal.userId !== userId) {
        throw new ForbiddenException({
          message: 'You do not have access to this goal',
          error: 'GoalAccessDenied',
        });
      }

      return goal;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'get goal by ID');
    }
  }

  /**
   * Update goal details
   * 
   * Flow:
   * 1. Verify ownership
   * 2. If planId provided, verify plan exists
   * 3. Update only provided fields
   * 
   * Note: Status updates use separate endpoint
   */
  async updateGoal(userId: string, goalId: string, dto: UpdateGoalDto) {
    try {
      // Verify ownership
      await this.getGoalById(userId, goalId);

      // If updating planId, verify plan exists and belongs to user
      if (dto.planId) {
        const plan = await this.prisma.workoutPlan.findUnique({
          where: { id: dto.planId },
        });

        if (!plan || plan.userId !== userId) {
          throw new NotFoundException({
            message: 'Workout plan not found',
            error: 'PlanNotFound',
          });
        }
      }

      this.logger.log(`Updating goal ${goalId} for user ${userId}`);

      const goal = await this.prisma.userGoal.update({
        where: { id: goalId },
        data: {
          description: dto.description,
          targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
          startWeightKg: dto.startWeightKg,
          targetWeightKg: dto.targetWeightKg,
        },
      });

      return goal;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'update goal');
    }
  }

  /**
   * Update goal status
   * 
   * Status transitions:
   * - active ↔ paused (user can pause/resume)
   * - active → achieved (goal completed)
   * - active → abandoned (user stopped pursuing)
   * - paused → achieved (resumed and completed)
   * - paused → abandoned (decided not to continue)
   * 
   * No restrictions on transitions (user has full control)
   */
  async updateGoalStatus(userId: string, goalId: string, dto: UpdateGoalStatusDto) {
    try {
      // Verify ownership
      await this.getGoalById(userId, goalId);

      this.logger.log(`Updating goal ${goalId} status to ${dto.status} for user ${userId}`);

      const goal = await this.prisma.userGoal.update({
        where: { id: goalId },
        data: { status: dto.status },
      });

      return goal;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'update goal status');
    }
  }

  /**
   * Delete a goal
   * 
   * Hard delete (no soft delete for now)
   * Cascade behavior: Goal deletion does NOT affect linked workout plans
   */
  async deleteGoal(userId: string, goalId: string) {
    try {
      // Verify ownership
      await this.getGoalById(userId, goalId);

      this.logger.log(`Deleting goal ${goalId} for user ${userId}`);

      await this.prisma.userGoal.delete({
        where: { id: goalId },
      });

      return { message: 'Goal deleted successfully' };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'delete goal');
    }
  }
}