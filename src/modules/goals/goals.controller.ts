import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { GoalsService } from './goals.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditEntity } from '../../common/decorators/audit-entity.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { UpdateGoalStatusDto } from './dto/update-goal-status.dto';
import { GoalStatus } from '@prisma/client';

/**
 * Goals Controller
 * 
 * Handles fitness goal management endpoints.
 * All routes require JWT authentication.
 * 
 * Route structure:
 * - GET    /goals           - List user's goals (optional status filter)
 * - POST   /goals           - Create new goal
 * - GET    /goals/:id       - Get specific goal
 * - PATCH  /goals/:id       - Update goal details
 * - DELETE /goals/:id       - Delete goal
 * - PATCH  /goals/:id/status - Update goal status
 * 
 * Design decisions:
 * - RESTful conventions with proper HTTP methods
 * - UUID validation on all :id params
 * - Status updates via separate endpoint for clarity
 * - All operations scoped to authenticated user
 */
@Controller('goals')
@UseGuards(JwtAuthGuard)
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  /**
   * Create a new goal
   *
   * POST /goals
   * Body: CreateGoalDto
   * Returns: Created goal
   */
  @Post()
  @AuditEntity('UserGoal')
  @HttpCode(HttpStatus.CREATED)
  async createGoal(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateGoalDto,
  ) {
    return this.goalsService.createGoal(user.id, dto);
  }

  /**
   * Get all user's goals
   * 
   * GET /goals
   * Query params: ?status=active (optional)
   * Returns: Array of goals
   */
  @Get()
  async getUserGoals(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: GoalStatus,
  ) {
    return this.goalsService.getUserGoals(user.id, status);
  }

  /**
   * Get specific goal by ID
   * 
   * GET /goals/:id
   * Returns: Goal details
   */
  @Get(':id')
  async getGoalById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) goalId: string,
  ) {
    return this.goalsService.getGoalById(user.id, goalId);
  }

  /**
   * Update goal details
   *
   * PATCH /goals/:id
   * Body: UpdateGoalDto
   * Returns: Updated goal
   */
  @Patch(':id')
  @AuditEntity('UserGoal')
  async updateGoal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) goalId: string,
    @Body() dto: UpdateGoalDto,
  ) {
    return this.goalsService.updateGoal(user.id, goalId, dto);
  }

  /**
   * Update goal status
   *
   * PATCH /goals/:id/status
   * Body: UpdateGoalStatusDto
   * Returns: Updated goal
   */
  @Patch(':id/status')
  @AuditEntity('UserGoal')
  async updateGoalStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) goalId: string,
    @Body() dto: UpdateGoalStatusDto,
  ) {
    return this.goalsService.updateGoalStatus(user.id, goalId, dto);
  }

  /**
   * Delete a goal
   *
   * DELETE /goals/:id
   * Returns: 204 No Content
   */
  @Delete(':id')
  @AuditEntity('UserGoal')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteGoal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) goalId: string,
  ) {
    return this.goalsService.deleteGoal(user.id, goalId);
  }
}