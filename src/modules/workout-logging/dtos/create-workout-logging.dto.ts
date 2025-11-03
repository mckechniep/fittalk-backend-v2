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
 * Exercise workout (required)
 * References Excercise.id from excercise library
 */
 @IsUUID()
 exerciseId: string
 /**
  * Optional: Workout plan this log belongs to.
  * Null if ad-hoc workout not following the program
  */
 @IsOptional()
 @IsUUID()
 planId?: string
}
