// dtos/update-workout-logging.dto.ts
import {
  IsOptional,
  IsInt,
  IsString,
  IsArray,
  ValidateNested,
  Min,
  Max,
  IsNumber,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for updating a workout log.
 *
 * Design decisions:
 * - All fields optional: Supports partial updates
 * - Cannot change exerciseId: That would be a different workout
 * - Cannot change planId/dayId/itemId: These are contextual, set at creation
 * - Cannot change performedAt: That would be re-logging, not updating
 * - Can update: durationMin, notes, sets (add/modify/mark incomplete)
 * - Nested sets use upsert pattern: update existing by setNumber, add new
 *
 * Use cases:
 * - Fix mistake: "I meant 80kg, not 8kg"
 * - Add notes: "Lower back felt tight on last set"
 * - Add missed sets: "Forgot to log final drop set"
 * - Mark set incomplete: "Failed rep 8, stopped for safety"
 * - Update duration: "Actual time was 65 min, not 60 min"
 *
 * Validation:
 * - At least one field must be present (otherwise, why update?)
 * - Service validates workout log belongs to user
 * - Service validates setNumbers are valid for this log
 */
export class UpdateWorkoutLogDto {
  /**
   * Updated total duration in minutes.
   *
   * Use case: Correcting initial estimate with actual time.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(300)
  durationMin?: number;

  /**
   * Updated or added notes.
   *
   * Behavior: Replaces existing notes (not append).
   * For append, client should fetch current notes and concatenate.
   */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  /**
   * Updated sets.
   *
   * Upsert pattern:
   * - If setNumber exists: UPDATE that set's data
   * - If setNumber doesn't exist: INSERT new set (for adding missed sets)
   * - Omitted sets remain unchanged
   *
   * Use cases:
   * - Correct weight: Update set 2 with correct weightKg
   * - Mark incomplete: Update set 3 with completed=false
   * - Add missed set: Add new set with setNumber=4
   *
   * Note: Cannot delete sets via this endpoint (prevents accidental data loss)
   * To delete: Use separate DELETE /logs/:id/sets/:setNumber endpoint (if needed)
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateWorkoutSetDto)
  sets?: UpdateWorkoutSetDto[];
}

/**
 * DTO for updating a single set.
 *
 * Must include setNumber to identify which set to update.
 * All performance fields optional (partial update).
 */
export class UpdateWorkoutSetDto {
  /**
   * Set number to update (1-indexed).
   * Required to identify which set this update applies to.
   *
   * Validation:
   * - Must be positive integer
   * - Service validates setNumber exists in workout log
   * - If setNumber doesn't exist, creates new set (append)
   */
  @IsInt()
  @Min(1)
  @Max(50)
  setNumber: number;

  /**
   * Updated reps completed.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  reps?: number;

  /**
   * Updated weight in kg.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  weightKg?: number;

  /**
   * Updated RIR (Reps In Reserve).
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  rir?: number;

  /**
   * Updated completion status.
   *
   * Use case: Mark set as incomplete if injury or form breakdown.
   */
  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}
