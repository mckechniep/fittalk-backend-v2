// dtos/create-meal-log.dto.ts
import {
    IsOptional,
    IsString,
    IsArray,
    ValidateNested,
    IsDateString,
    MaxLength,
    IsUUID,
    IsNumber,
    Min,
    Max,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for creating a meal log.
 *
 * Design decisions:
 * - mealType required: breakfast, lunch, dinner, snack
 * - loggedAt optional: defaults to now() if not provided
 * - Nested foods array: All food entries logged atomically
 * - Validation: Ensures data quality (portion ranges)
 *
 * Use cases:
 * - Real-time logging: User logs meal as they eat
 * - Retroactive logging: User logs yesterday's meals
 * - Recipe logging: User logs complete meal with multiple foods
 * - Quick log: User logs single food item
 *
 * Transaction: Creates MealLog + all MealEntries atomically
 */
export class CreateMealLogDto {
    /**
     * Type of meal (required)
     * Examples: "breakfast", "lunch", "dinner", "snack"
     */
    @IsString()
    @MaxLength(50)
    mealType: string;

    /**
     * When the meal was consumed (ISO 8601).
     * Defaults to now() if not provided.
     */
    @IsOptional()
    @IsDateString()
    loggedAt?: string;

    /**
     * Free-form notes about the meal.
     * Examples: "Restaurant meal", "Homemade", "Meal prep"
     */
    @IsOptional()
    @IsString()
    @MaxLength(500)
    notes?: string;

    /**
     * Array of food items in this meal.
     * Must have at least one food item.
     */
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateMealEntryDto)
    foods: CreateMealEntryDto[];
}

/**
 * DTO for a single food entry within a meal log.
 *
 * Nested within CreateMealLogDto.
 * Represents actual food consumed with portion size.
 */
export class CreateMealEntryDto {
    /**
     * Food item reference (required)
     * References FoodItem.id from food database
     */
    @IsUUID()
    foodItemId: string;

    /**
     * Portion size multiplier (required)
     * Example: 1.5 = 1.5 servings, 2 = 2 servings
     * Default: 1 (one serving)
     */
    @IsNumber()
    @Min(0.1)
    @Max(50)
    servings: number;

    /**
     * Optional: Serving size in grams for this entry
     * Overrides the default servingG from FoodItem if needed
     */
    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(5000)
    servingG?: number;
}
