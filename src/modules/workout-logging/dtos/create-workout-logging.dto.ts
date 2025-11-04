// dtos/create-workout-logging.dto.ts
import {
    IsUUID,
    IsOptional,
    IsInt,
    IsString,
    IsArray,
    ValidateNested,
    Min,
    Max,
    IsNumber,
    IsBoolean,
    IsDateString,
    MaxLength,
} from 'class-validator'
import { Type } from 'class-transformer'

/**
 * DTO for creating a workout log.
 * 
 * Design decisions:
 * - exerciseId required: Must log at least which exercise was performed
 * - planId/dayId/itemId optional: Supports both programmed and ad-hoc workouts
 * - performedAt optional: Defaults to now() if not provided
 * - Nested sets array: All sets logged atomically in one transaction
 * - Validation: Ensures data quality (rep ranges, weight ranges, RIR 0-10)
 * 
 * Use cases:
 * - Programmed workout: User follows plan, logs exercises with planId/dayId/itemId
 * - Ad-hoc workout: User does exercises not in plan, only exerciseId provided
 * - Manual entry: User logs workout retroactively with performedAt
 * - Quick log: Minimum data (exerciseId + sets), rest auto-populated
 * 
 * Transaction: Creates WorkoutLog + all WorkoutSets atomically
 */
export class CreateWorkoutLogDto {   
/**
 * Exercise performed (required)
 * References Excercise.id from excercise library
 */
@IsUUID()
 exerciseId: string;
 /**
  * Optional: Workout plan this log belongs to.
  * Null if ad-hoc workout not following the program
  */
 @IsOptional()
 @IsUUID()
 planId?: string;
/**
   * Optional: Specific day in the plan.
   * Null if not following program structure.
   */
  @IsOptional()
  @IsUUID()
  dayId?: string;

  /**
   * Optional: Specific programmed exercise item.
   * Used to compare actual vs prescribed (did they follow the program?).
   */
  @IsOptional()
  @IsUUID()
  itemId?: string;

  /**
   * When the exercise was performed (ISO 8601).
   * Defaults to now() if not provided.
   * 
   * Use cases:
   * - Manual retroactive logging: "I worked out yesterday"
   * - Timezone handling: Client sends local time, server stores UTC
   */
  @IsOptional()
  @IsDateString()
  performedAt?: string;

  /**
   * Total workout duration in minutes.
   * Optional: Can be calculated from timestamps or estimated.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(300)
  durationMin?: number;

  /**
   * Free-form notes about the workout.
   * Examples: "Felt strong today", "Lower back tight", "Used different bar"
   */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  /**
   * Array of sets performed.
   * Must have at least one set.
   * Order matters: setNumber assigned sequentially (1, 2, 3, ...)
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateWorkoutSetDto)
  sets: CreateWorkoutSetDto[];
}

/**
 * DTO for a single set within a workout log.
 * 
 * Nested within CreateWorkoutLogDto.
 * Represents actual performance (not prescription).
 */
export class CreateWorkoutSetDto {
  /**
   * Reps completed.
   * Optional: Some exercises don't track reps (e.g., plank - time-based)
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  reps?: number;

  /**
   * Weight used in kg.
   * Null for bodyweight exercises or exercises without weight.
   * 
   * Validation: 0-500 kg (covers most training scenarios)
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  weightKg?: number;

  /**
   * RIR (Reps In Reserve) - how many more reps could have been done.
   * 0 = absolute failure, 3 = 3 more reps possible
   * 
   * Per requirements: Use RIR, not RPE
   * 
   * Validation: 0-10 (standard RIR scale)
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  rir?: number;

  /**
   * Whether the set was completed as planned.
   * Default: true
   * 
   * False if: injury mid-set, equipment failure, form breakdown
   */
  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}
