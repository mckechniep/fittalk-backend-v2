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

/**
 * Workout plan summary (subset of WorkoutPlan).
 * Only fields needed for schedule display.
 */
export class WorkoutPlanSummaryDto {
  @Expose()
  id: string;

  @Expose()
  title: string;

  @Expose()
  status: 'draft' | 'active' | 'archived';

  @Expose()
  weeks: number;
}

/**
 * Workout day details with exercises.
 * Full information needed to display and execute workout.
 */
export class WorkoutDayDetailsDto {
  @Expose()
  id: string;

  @Expose()
  weekNumber: number;

  @Expose()
  dayNumber: number;

  @Expose()
  focus: 'strength' | 'hypertrophy' | 'cardio' | 'mobility' | 'mixed';

  @Expose()
  notes: string | null;

  /**
   * Exercises to perform in this workout.
   * Includes sets, reps, RIR, tempo, rest periods.
   */
  @Expose()
  @Type(() => WorkoutItemDetailsDto)
  items: WorkoutItemDetailsDto[];
}

/**
 * Exercise item within a workout.
 * Prescription details (how to perform the exercise).
 */
export class WorkoutItemDetailsDto {
  @Expose()
  id: string;

  @Expose()
  order: number;

  @Expose()
  exerciseId: string;

  /**
   * Exercise details embedded.
   * Avoids client needing separate exercise lookup.
   */
  @Expose()
  @Type(() => ExerciseSummaryDto)
  exercise: ExerciseSummaryDto;

  @Expose()
  targetSets: number;

  @Expose()
  targetReps: number | null;

  @Expose()
  targetRir: number | null;  // RIR (Reps In Reserve)

  @Expose()
  targetWeight: number | null;

  @Expose()
  tempo: string | null;  // e.g., "3-1-1"

  @Expose()
  restSec: number | null;  // Rest between sets in seconds
}

/**
 * Exercise summary (subset of Exercise model).
 */
export class ExerciseSummaryDto {
  @Expose()
  id: string;

  @Expose()
  slug: string;

  @Expose()
  name: string;

  @Expose()
  primaryGroup: string;

  @Expose()
  equipment: string;

  @Expose()
  instructions: string | null;

  @Expose()
  media: unknown | null;  // URLs for images/videos
}

/**
 * Response for weekly schedule generation.
 * Includes success/failure details for each day.
 */
export class ScheduleWeekResponseDto {
  /**
   * Week start date (echoed from request).
   */
  @Expose()
  weekStart: string;

  /**
   * Successfully scheduled workouts.
   */
  @Expose()
  @Type(() => ScheduledWorkoutResponseDto)
  scheduled: ScheduledWorkoutResponseDto[];

  /**
   * Days that couldn't be scheduled (no available windows or too long).
   * Client can show warnings to user.
   */
  @Expose()
  @Type(() => UnscheduledDayDto)
  unscheduled: UnscheduledDayDto[];

  /**
   * Summary statistics.
   */
  @Expose()
  summary: {
    totalDays: number;
    scheduledCount: number;
    unscheduledCount: number;
  };
}

/**
 * Information about a workout day that couldn't be scheduled.
 * Helps user understand why and how to fix.
 */
export class UnscheduledDayDto {
  @Expose()
  dayId: string;

  @Expose()
  weekNumber: number;

  @Expose()
  dayNumber: number;

  @Expose()
  focus: string;

  /**
   * Reason why it couldn't be scheduled.
   * Examples:
   * - "No availability on this day"
   * - "Workout duration (90 min) exceeds largest available window (60 min)"
   * - "All available windows already occupied"
   */
  @Expose()
  reason: string;

  /**
   * Estimated duration in minutes.
   * Helps user understand why workout didn't fit.
   */
  @Expose()
  estimatedDurationMin: number;
}
