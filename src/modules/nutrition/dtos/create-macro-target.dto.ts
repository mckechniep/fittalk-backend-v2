// dtos/create-macro-target.dto.ts
import {
    IsOptional,
    IsInt,
    IsDateString,
    Min,
    Max,
} from 'class-validator';

/**
 * DTO for creating a macro target.
 *
 * Design decisions:
 * - At least one macro value required (calories, protein, carbs, or fats)
 * - startsOn optional: defaults to now() if not provided
 * - endsOn optional: null means indefinite (until new target created)
 *
 * Use cases:
 * - User sets initial macro targets after consultation
 * - User updates targets based on progress
 * - AI adjusts targets based on goals and adherence
 * - Bulk/cut phases with different targets
 */
export class CreateMacroTargetDto {
    /**
     * Target calories per day (optional)
     * Example: 2200 calories
     */
    @IsOptional()
    @IsInt()
    @Min(500)
    @Max(10000)
    calories?: number;

    /**
     * Target protein in grams per day (optional)
     * Example: 180g protein
     */
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(1000)
    proteinG?: number;

    /**
     * Target carbohydrates in grams per day (optional)
     * Example: 250g carbs
     */
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(2000)
    carbsG?: number;

    /**
     * Target fats in grams per day (optional)
     * Example: 60g fats
     */
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(500)
    fatsG?: number;

    /**
     * When this target becomes active (ISO 8601)
     * Defaults to now() if not provided
     */
    @IsOptional()
    @IsDateString()
    startsOn?: string;

    /**
     * When this target expires (ISO 8601)
     * Null = indefinite (until new target created)
     */
    @IsOptional()
    @IsDateString()
    endsOn?: string;
}
