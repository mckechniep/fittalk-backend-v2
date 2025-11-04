// dtos/get-meal-logs-query.dto.ts
import {
    IsOptional,
    IsDateString,
    IsInt,
    Min,
    Max,
    IsString,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for querying meal logs with filtering and pagination.
 *
 * All fields optional - returns all logs if no filters provided.
 *
 * Use cases:
 * - Date range: Get all meals for a specific week/month
 * - Meal type: Get all breakfast meals
 * - Pagination: Load meal history in chunks
 */
export class GetMealLogsQueryDto {
    /**
     * Filter by meal type
     * Example: "breakfast", "lunch", "dinner", "snack"
     */
    @IsOptional()
    @IsString()
    mealType?: string;

    /**
     * Start of date range (inclusive)
     * Example: "2025-01-01T00:00:00Z"
     */
    @IsOptional()
    @IsDateString()
    startDate?: string;

    /**
     * End of date range (exclusive)
     * Example: "2025-01-31T23:59:59Z"
     */
    @IsOptional()
    @IsDateString()
    endDate?: string;

    /**
     * Page number (default: 1)
     */
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    /**
     * Items per page (default: 20, max: 100)
     */
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number = 20;
}
