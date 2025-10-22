// dtos/scheduled-workout-response.dto.ts
import { Expose, Type } from 'class-transformer';

/**
 * Exercise summary (subset of Exercise model).
 * Declared first - no dependencies.
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
  media: unknown | null;
}

/**
 * Exercise item within a workout.
 * Prescription details (how to perform the exercise).
 * Depends on: ExerciseSummaryDto
 */
export class WorkoutItemDetailsDto {
  @Expose()
  id: string;

  @Expose()
  order: number;

  @Expose()
  exerciseId: string;

  @Expose()
  @Type(() => ExerciseSummaryDto)
  exercise: ExerciseSummaryDto;

  @Expose()
  targetSets: number;

  @Expose()
  targetReps: number | null;

  @Expose()
  targetRir: number | null;

  @Expose()
  targetWeight: number | null;

  @Expose()
  tempo: string | null;

  @Expose()
  restSec: number | null;
}

/**
 * Workout day details with exercises.
 * Full information needed to display and execute workout.
 * Depends on: WorkoutItemDetailsDto
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

  @Expose()
  @Type(() => WorkoutItemDetailsDto)
  items: WorkoutItemDetailsDto[];
}

/**
 * Workout plan summary (subset of WorkoutPlan).
 * Only fields needed for schedule display.
 * No dependencies.
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
 * Response DTO for scheduled workout.
 * Depends on: WorkoutPlanSummaryDto, WorkoutDayDetailsDto
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

  @Expose()
  scheduledAt: Date;

  @Expose()
  status: 'scheduled' | 'in_progress' | 'completed' | 'skipped' | 'cancelled';

  @Expose()
  @Type(() => WorkoutPlanSummaryDto)
  plan: WorkoutPlanSummaryDto | null;

  @Expose()
  @Type(() => WorkoutDayDetailsDto)
  day: WorkoutDayDetailsDto | null;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;
}

/**
 * Information about a workout day that couldn't be scheduled.
 * Helps user understand why and how to fix.
 * No dependencies.
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

  @Expose()
  reason: string;

  @Expose()
  estimatedDurationMin: number;
}

/**
 * Response for weekly schedule generation.
 * Includes success/failure details for each day.
 * Depends on: ScheduledWorkoutResponseDto, UnscheduledDayDto
 */
export class ScheduleWeekResponseDto {
  @Expose()
  weekStart: string;

  @Expose()
  @Type(() => ScheduledWorkoutResponseDto)
  scheduled: ScheduledWorkoutResponseDto[];

  @Expose()
  @Type(() => UnscheduledDayDto)
  unscheduled: UnscheduledDayDto[];

  @Expose()
  summary: {
    totalDays: number;
    scheduledCount: number;
    unscheduledCount: number;
  };
}
