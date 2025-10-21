// dtos/scheduled-workout-response.dto.ts
import { Expose, Type } from 'class-transformer';

/**
 * Response DTO for scheduled workout.
 * 
 * Design decisions:
 * - Includes nested WorkoutDay details (avoid N+1 queries)
 * - Includes nested WorkoutPlan summary (context for mobile)
 * - Uses @Expose() for explicit serialization control
 * - Computed fields derived from data (not stored separately)
 * 
 * Use cases:
 * - GET /workouts/schedule/week - List week's scheduled workouts
 * - GET /workouts/schedule/upcoming - Next workout to do
 * - POST /workouts/schedule/week - Returns generated schedule
 */
export class ScheduledWorkoutResponseDto {
  @Expose()
  id: string;

  @Expose()
  userId: string;

  @Expose()
  planId: string | null;

  @Expose()
  dayId: string | null;

  /**
   * Scheduled start time (ISO 8601).
   * Fits within user's availability window.
   */
  @Expose()
  scheduledAt: Date;

  /**
   * Workout status.
   * - scheduled: Not started yet
   * - in_progress: User currently doing this workout
   * - completed: Finished
   * - skipped: User skipped this workout
   * - cancelled: Removed from schedule
   */
  @Expose()
  status: 'scheduled' | 'in_progress' | 'completed' | 'skipped' | 'cancelled';

  /**
   * Nested plan details (summary only).
   * Null if workout was scheduled without a plan (ad-hoc workout).
   */
  @Expose()
  @Type(() => WorkoutPlanSummaryDto)
  plan: WorkoutPlanSummaryDto | null;

  /**
   * Nested workout day details.
   * Includes exercises, sets, reps for mobile rendering.
   * Null if no specific day assigned.
   */
  @Expose()
  @Type(() => WorkoutDayDetailsDto)
  day: WorkoutDayDetailsDto | null;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;
}
