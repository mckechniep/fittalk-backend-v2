// dtos/create-grocery-list.dto.ts
import {
    IsString,
    IsOptional,
    IsArray,
    ValidateNested,
    IsDateString,
    MaxLength,
    IsUUID,
    IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for creating a grocery list.
 *
 * Design decisions:
 * - title and weekOf required for organization
 * - items optional: can create empty list and add items later
 * - foodItemId optional: allows adding non-database items (e.g., "paper towels")
 *
 * Use cases:
 * - Create weekly grocery list
 * - Generate list from meal plan
 * - Share list with household members
 */
export class CreateGroceryListDto {
    /**
     * List title (optional)
     * Example: "Weekly Grocery List", "Meal Prep Shopping"
     * Defaults to "Weekly Grocery List"
     */
    @IsOptional()
    @IsString()
    @MaxLength(200)
    title?: string;

    /**
     * Week this list is for (ISO 8601 date)
     * Example: "2025-01-20" (Monday of that week)
     */
    @IsDateString()
    weekOf: string;

    /**
     * Items in this grocery list (optional)
     */
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateGroceryItemDto)
    items?: CreateGroceryItemDto[];
}

/**
 * DTO for a single item in a grocery list.
 *
 * Nested within CreateGroceryListDto.
 */
export class CreateGroceryItemDto {
    /**
     * Reference to food item (optional)
     * Null for non-food items or items not in database
     */
    @IsOptional()
    @IsUUID()
    foodItemId?: string;

    /**
     * Item name (required)
     * Example: "Chicken Breast", "Brown Rice", "Paper Towels"
     */
    @IsString()
    @MaxLength(200)
    name: string;

    /**
     * Quantity/amount (optional)
     * Example: "2 lbs", "1 bag", "6 pack"
     */
    @IsOptional()
    @IsString()
    @MaxLength(100)
    quantity?: string;

    /**
     * Whether item is checked off (optional)
     * Default: false
     */
    @IsOptional()
    @IsBoolean()
    isChecked?: boolean;
}
