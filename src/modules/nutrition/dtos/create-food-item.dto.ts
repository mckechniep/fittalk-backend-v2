// dtos/create-food-item.dto.ts
import {
    IsString,
    IsOptional,
    IsInt,
    IsArray,
    Min,
    Max,
    MaxLength,
    IsNumber,
} from 'class-validator';

/**
 * DTO for creating a food item.
 *
 * Design decisions:
 * - Required: name, nutritional values per serving
 * - Optional: brand, servingG (some items measured in pieces/units)
 * - Tags for categorization (e.g., "protein", "dairy", "vegetarian")
 * - Source tracks where the food came from (user-created, API, etc.)
 *
 * Use cases:
 * - User adds custom food item
 * - Import from food database API
 * - Admin creates common foods
 * - Recipe builder uses food items
 */
export class CreateFoodItemDto {
    /**
     * Food name (required)
     * Example: "Chicken Breast", "Brown Rice", "Whey Protein"
     */
    @IsString()
    @MaxLength(200)
    name: string;

    /**
     * Brand name (optional)
     * Example: "Optimum Nutrition", "Kirkland", "Great Value"
     */
    @IsOptional()
    @IsString()
    @MaxLength(100)
    brand?: string;

    /**
     * Serving size in grams (optional)
     * Example: 100g chicken breast, 30g protein powder
     * Null for items measured in pieces/units
     */
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(5000)
    servingG?: number;

    /**
     * Calories per serving (required)
     * Example: 165 calories in 100g chicken breast
     */
    @IsInt()
    @Min(0)
    @Max(10000)
    calories: number;

    /**
     * Protein in grams per serving (required)
     */
    @IsNumber()
    @Min(0)
    @Max(500)
    proteinG: number;

    /**
     * Carbohydrates in grams per serving (required)
     */
    @IsNumber()
    @Min(0)
    @Max(500)
    carbsG: number;

    /**
     * Fats in grams per serving (required)
     */
    @IsNumber()
    @Min(0)
    @Max(500)
    fatsG: number;

    /**
     * Tags for categorization/filtering (optional)
     * Examples: ["protein", "lean"], ["carb", "whole-grain"], ["vegan", "high-fiber"]
     */
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    tags?: string[];
}
