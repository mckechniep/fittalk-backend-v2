// scheduling/scheduling.controller.ts
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ScheduledWorkoutStatus } from '@prisma/client';
import { SchedulingService } from './scheduling.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  ScheduleWeekDto,
  GetScheduleQueryDto,
} from '../dtos/schedule-week.dto';
import {
  ScheduledWorkoutResponseDto,
  ScheduleWeekResponseDto,
} from '../dtos/schedule-workout-response.dto';

/**
 * Scheduling Controller
 *
 * Handles workout schedule generation and management.
 * All routes require JWT authentication.
 *
 * Responsibilities:
 * - Generate weekly workout schedules (fits workouts into availability windows)
 * - Fetch scheduled workouts for display
 * - Cancel individual scheduled workouts
 * - Query upcoming workouts
 *
 * Design decisions:
 * - RESTful: /workouts/schedule as base path
 * - Idempotent generation: Can safely regenerate same week
 * - Rich responses: Includes both scheduled and unscheduled workouts with reasons
 * - Query parameters for filtering (week, plan, status)
 *
 * Integration points:
 * - Triggered after consultation completion (first schedule)
 * - Triggered after availability update (regenerate affected weeks)
 * - Triggered after plan modification (regenerate future weeks)
 * - Queried by mobile for calendar view
 * - Queried by live session (link scheduled → active session)
 *
 * Security:
 * - All routes protected by JwtAuthGuard
 * - User can only access/modify their own schedules
 * - Distributed locks prevent concurrent generation
 */
@Controller('workouts/schedule')
@UseGuards(JwtAuthGuard)
export class SchedulingController {
  constructor(private readonly schedulingService: SchedulingService) {}

  /**
   * POST /workouts/schedule/week
   *
   * Generate weekly workout schedule.
   *
   * Request body:
   * {
   *   "weekStart": "2025-01-20",     // ISO date (YYYY-MM-DD)
   *   "planId": "uuid",              // Optional: defaults to active plan
   *   "regenerate": true             // Optional: force regeneration
   * }
   *
   * Algorithm:
   * - Fetches user's WorkoutPlan and WorkoutDays for the week
   * - Fetches user's AvailabilityWindows
   * - Uses backtracking algorithm to find optimal placement
   * - Maximizes number of workouts scheduled
   * - Respects availability window priorities
   *
   * Idempotency:
   * - If week already scheduled and regenerate=false, returns existing
   * - If regenerate=true, deletes and recreates schedule
   * - Safe to call multiple times
   *
   * Concurrency:
   * - Uses Redis distributed lock: lock:schedule:{userId}:{weekKey}
   * - Only one generation per user per week at a time
   * - Returns 400 if generation already in progress
   *
   * Response includes:
   * - scheduled: Workouts successfully placed (with full details)
   * - unscheduled: Workouts that couldn't fit (with reasons)
   * - summary: Total stats (5/7 scheduled, 2/7 unscheduled)
   *
   * Use cases:
   * - Initial: After consultation completion, generate first week
   * - Manual: User clicks "Regenerate Schedule" after changing availability
   * - Auto: Cron job generates next week for all users
   *
   * Status: 201 Created
   */
  @Post('week')
  @HttpCode(HttpStatus.CREATED)
  async generateWeekSchedule(
    @CurrentUser('id') userId: string,
    @Body() dto: ScheduleWeekDto,
  ): Promise<ScheduleWeekResponseDto> {
    return this.schedulingService.generateWeekSchedule(userId, dto);
  }

  /**
   * GET /workouts/schedule/week
   *
   * Fetch scheduled workouts for a specific week.
   *
   * Query parameters:
   * - weekStart: ISO date (YYYY-MM-DD), defaults to current week
   * - planId: Filter by plan (optional)
   * - status: Filter by status (optional): scheduled|in_progress|completed|skipped|cancelled
   *
   * Response:
   * Array of scheduled workouts with nested plan and day details.
   * Sorted by scheduledAt ascending.
   *
   * Use cases:
   * - Calendar view: Display week's workouts
   * - Plan view: Show schedule for specific plan
   * - History: Filter by status=completed to see past workouts
   *
   * Example:
   * GET /workouts/schedule/week?weekStart=2025-01-20&status=scheduled
   *
   * Returns: ScheduledWorkoutResponseDto[]
   */
  @Get('week')
  async getWeekSchedule(
    @CurrentUser('id') userId: string,
    @Query() query: GetScheduleQueryDto,
  ): Promise<ScheduledWorkoutResponseDto[]> {
    return this.schedulingService.getWeekSchedule(
      userId,
      query.weekStart,
      query.planId,
      query.status as ScheduledWorkoutStatus | undefined,
    );
  }

  /**
   * GET /workouts/schedule/upcoming
   *
   * Get next upcoming scheduled workout.
   *
   * Filters:
   * - scheduledAt >= now (future workouts only)
   * - status = 'scheduled' (not completed/cancelled)
   *
   * Sorted by scheduledAt ascending (earliest first).
   *
   * Response:
   * - Single ScheduledWorkoutResponseDto or null if none scheduled
   *
   * Use cases:
   * - Home screen: "Next workout: Upper Body Strength at 9:00 AM"
   * - Quick start: "Start Today's Workout" button
   * - Notifications: "Your workout starts in 30 minutes"
   *
   * Example:
   * GET /workouts/schedule/upcoming
   *
   * Returns:
   * {
   *   "id": "uuid",
   *   "scheduledAt": "2025-01-21T09:00:00Z",
   *   "day": {
   *     "focus": "strength",
   *     "items": [...]
   *   }
   * }
   */
  @Get('upcoming')
  async getUpcomingWorkout(
    @CurrentUser('id') userId: string,
  ): Promise<ScheduledWorkoutResponseDto | null> {
    return this.schedulingService.getUpcomingWorkout(userId);
  }

  /**
   * DELETE /workouts/schedule/:id
   *
   * Cancel a scheduled workout.
   *
   * Security:
   * - Verifies user owns the scheduled workout
   * - Returns 403 if attempting to cancel another user's workout
   *
   * Side effects:
   * - Updates status to 'cancelled'
   * - Does NOT delete record (preserves for analytics)
   * - Cancelled workouts excluded from upcoming/week queries
   *
   * Use cases:
   * - User injured: Cancel this week's leg day
   * - Schedule conflict: Cancel and manually reschedule
   * - Rest day: User decides to skip workout
   *
   * Returns: 204 No Content on success
   *
   * Throws:
   * - 404 if workout not found
   * - 403 if user doesn't own the workout
   *
   * Example:
   * DELETE /workouts/schedule/uuid-123
   * → 204 No Content
   *
   * Note: To fully remove, user would regenerate schedule.
   * This is soft-cancel (preserves record for audit).
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelScheduledWorkout(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) scheduledWorkoutId: string,
  ): Promise<void> {
    return this.schedulingService.cancelScheduledWorkout(
      userId,
      scheduledWorkoutId,
    );
  }
}
