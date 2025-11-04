// dtos/workout-logging-response.dto.ts
import {
  IsOptional,
  IsUUID,
  IsDateString,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Expose, Type } from 'class-transformer';

/**
 * Exercise summary (subset of Exercise model).
 * Declared first - no dependencies.
 * Reusable across workout contexts.
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
 * Set details within a workout log.
 * Represents actual performance data.
 */
export class WorkoutSetResponseDto {
  @Expose()
  id: string;

  @Expose()
  logId: string;

  /**
   * Set number (1-indexed).
   * Order of sets in the workout.
   */
  @Expose()
  setNumber: number;

  /**
   * Reps completed.
   * Null if exercise doesn't track reps (e.g., time-based like plank).
   */
  @Expose()
  reps: number | null;

  /**
   * Weight used in kg.
   * Null for bodyweight exercises.
   */
  @Expose()
  weightKg: number | null;

  /**
   * RIR (Reps In Reserve) - how many more reps could have been done.
   * 0 = absolute failure, 10 = very easy.
   */
  @Expose()
  rir: number | null;

  /**
   * Whether set was completed.
   * False if stopped early due to injury, form breakdown, etc.
   */
  @Expose()
  completed: boolean;

  @Expose()
  createdAt: Date;
}

/**
 * Workout log response with all details.
 * 
 * Design decisions:
 * - Includes nested exercise details (avoid N+1 queries)
 * - Includes all sets ordered by setNumber
 * - Optional plan/day/item context for programmed workouts
 * - Uses @Expose() for security (explicit serialization)
 * 
 * Use cases:
 * - GET /workout-logging/:id - Fetch single log with sets
 * - GET /workout-logging - List user's workout history
 * - POST /workout-logging - Returns created log
 * - PATCH /workout-logging/:id - Returns updated log
 */
export class WorkoutLogResponseDto {
  @Expose()
  id: string;

  @Expose()
  userId: string;

  /**
   * Optional: Workout plan this log belongs to.
   * Null if ad-hoc workout.
   */
  @Expose()
  planId: string | null;

  /**
   * Optional: Specific day in the plan.
   * Null if not following program.
   */
  @Expose()
  dayId: string | null;

  /**
   * Optional: Specific programmed item.
   * Null if not following prescription.
   */
  @Expose()
  itemId: string | null;

  /**
   * Exercise performed (required).
   * Full exercise details embedded.
   */
  @Expose()
  exerciseId: string;

  @Expose()
  @Type(() => ExerciseSummaryDto)
  exercise: ExerciseSummaryDto;

  /**
   * When exercise was performed (UTC).
   * Client converts to user's timezone for display.
   */
  @Expose()
  performedAt: Date;

  /**
   * Total duration in minutes.
   * Null if not tracked.
   */
  @Expose()
  durationMin: number | null;

  /**
   * User notes about the workout.
   * Examples: "Felt strong", "Lower back tight"
   */
  @Expose()
  notes: string | null;

  /**
   * All sets performed in this workout.
   * Ordered by setNumber ascending (1, 2, 3, ...)
   */
  @Expose()
  @Type(() => WorkoutSetResponseDto)
  sets: WorkoutSetResponseDto[];

  @Expose()
  createdAt: Date;
}

/**
 * Paginated workout log history response.
 * 
 * Used by GET /workout-logging endpoint with pagination.
 */
export class WorkoutLogHistoryResponseDto {
  /**
   * Array of workout logs.
   */
  @Expose()
  @Type(() => WorkoutLogResponseDto)
  logs: WorkoutLogResponseDto[];

  /**
   * Pagination metadata.
   */
  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Query DTO for fetching workout logs.
 * Used with GET endpoint.
 */
export class GetWorkoutLogsQueryDto {
  /**
   * Filter by exercise ID.
   */
  @IsOptional()
  @IsUUID()
  exerciseId?: string;

  /**
   * Filter by plan ID.
   */
  @IsOptional()
  @IsUUID()
  planId?: string;

  /**
   * Start date filter (ISO 8601).
   * Returns logs on or after this date.
   */
  @IsOptional()
  @IsDateString()
  startDate?: string;

  /**
   * End date filter (ISO 8601).
   * Returns logs before this date.
   */
  @IsOptional()
  @IsDateString()
  endDate?: string;

  /**
   * Page number (1-indexed).
   * Default: 1
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  /**
   * Items per page.
   * Default: 20, Max: 100
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}