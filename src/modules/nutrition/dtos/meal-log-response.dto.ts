// dtos/meal-log-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { FoodItemResponseDto } from './food-item-response.dto';

/**
 * Response DTO for meal entry (food within a meal)
 */
export class MealEntryResponseDto {
    @ApiProperty({ description: 'Unique identifier', example: 'uuid' })
    @Expose()
    id: string;

    @ApiProperty({ description: 'Meal log ID', example: 'uuid' })
    @Expose()
    mealLogId: string;

    @ApiProperty({ description: 'Food item ID', example: 'uuid' })
    @Expose()
    foodItemId: string;

    @ApiProperty({
        description: 'Food item details',
        type: FoodItemResponseDto
    })
    @Expose()
    @Type(() => FoodItemResponseDto)
    foodItem: FoodItemResponseDto;

    @ApiProperty({ description: 'Number of servings', example: 1.5 })
    @Expose()
    servings: number;

    @ApiProperty({
        description: 'Serving size in grams (override)',
        example: 150,
        required: false
    })
    @Expose()
    servingG: number | null;

    @ApiProperty({ description: 'Creation timestamp' })
    @Expose()
    createdAt: Date;
}

/**
 * Response DTO for meal log with calculated totals
 */
export class MealLogResponseDto {
    @ApiProperty({ description: 'Unique identifier', example: 'uuid' })
    @Expose()
    id: string;

    @ApiProperty({ description: 'User ID', example: 'uuid' })
    @Expose()
    userId: string;

    @ApiProperty({ description: 'Meal type', example: 'breakfast' })
    @Expose()
    mealType: string;

    @ApiProperty({ description: 'When meal was consumed' })
    @Expose()
    loggedAt: Date;

    @ApiProperty({
        description: 'Free-form notes',
        example: 'Post-workout meal',
        required: false
    })
    @Expose()
    notes: string | null;

    @ApiProperty({
        description: 'Food entries in this meal',
        type: [MealEntryResponseDto]
    })
    @Expose()
    @Type(() => MealEntryResponseDto)
    entries: MealEntryResponseDto[];

    @ApiProperty({ description: 'Total calories for this meal', example: 450 })
    @Expose()
    totalCalories: number;

    @ApiProperty({ description: 'Total protein in grams', example: 45 })
    @Expose()
    totalProteinG: number;

    @ApiProperty({ description: 'Total carbs in grams', example: 50 })
    @Expose()
    totalCarbsG: number;

    @ApiProperty({ description: 'Total fats in grams', example: 12 })
    @Expose()
    totalFatsG: number;

    @ApiProperty({ description: 'Creation timestamp' })
    @Expose()
    createdAt: Date;

    @ApiProperty({ description: 'Last update timestamp' })
    @Expose()
    updatedAt: Date;
}

/**
 * Paginated response for meal logs
 */
export class PaginatedMealLogsResponseDto {
    @ApiProperty({
        description: 'Array of meal logs',
        type: [MealLogResponseDto]
    })
    @Expose()
    @Type(() => MealLogResponseDto)
    logs: MealLogResponseDto[];

    @ApiProperty({
        description: 'Pagination metadata',
        example: {
            page: 1,
            limit: 20,
            total: 156,
            totalPages: 8
        }
    })
    @Expose()
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}
