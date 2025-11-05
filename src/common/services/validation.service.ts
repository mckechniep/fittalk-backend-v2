import { Injectable, BadRequestException } from '@nestjs/common';

/**
 * Validation Service
 *
 * Centralized validation logic for common validation patterns across the application.
 * Eliminates duplicated validation code and ensures consistent validation rules.
 *
 * Features:
 * - Nutrition data validation (calories vs macros consistency)
 * - Date range validation
 * - Time range validation
 * - Numeric range validation
 *
 * Usage:
 * ```typescript
 * constructor(private readonly validationService: ValidationService) {}
 *
 * this.validationService.validateNutritionData({
 *   calories: 500,
 *   proteinG: 30,
 *   carbsG: 50,
 *   fatsG: 20
 * });
 * ```
 */
@Injectable()
export class ValidationService {
    /**
     * Validate nutrition data consistency
     *
     * Ensures that declared calories match calculated calories from macros
     * within a reasonable margin of error (10%).
     *
     * Formula:
     * - Protein: 4 cal/g
     * - Carbs: 4 cal/g
     * - Fats: 9 cal/g
     *
     * @param data - Nutrition data with calories and macros
     * @param marginPercent - Allowed margin of error (default: 10%)
     * @throws BadRequestException if calories don't match within margin
     */
    validateNutritionData(
        data: {
            calories: number;
            proteinG: number;
            carbsG: number;
            fatsG: number;
        },
        marginPercent: number = 10,
    ): void {
        // Calculate expected calories from macros
        const calculatedCalories =
            Number(data.proteinG) * 4 +
            Number(data.carbsG) * 4 +
            Number(data.fatsG) * 9;

        // Calculate margin
        const margin = (data.calories * marginPercent) / 100;
        const difference = Math.abs(data.calories - calculatedCalories);

        if (difference > margin) {
            throw new BadRequestException({
                message: `Nutrition data inconsistency: Declared calories (${data.calories}) don't match calculated calories (${Math.round(calculatedCalories)}) from macros`,
                error: 'NutritionDataInconsistent',
                details: {
                    declared: data.calories,
                    calculated: Math.round(calculatedCalories),
                    difference: Math.round(difference),
                    allowedMargin: Math.round(margin),
                },
            });
        }
    }

    /**
     * Validate date range
     *
     * Ensures that start date is before or equal to end date.
     *
     * @param startDate - Start date
     * @param endDate - End date (can be null for open-ended ranges)
     * @param fieldName - Name of the field for error message (default: 'date range')
     * @throws BadRequestException if start date is after end date
     */
    validateDateRange(
        startDate: Date,
        endDate: Date | null,
        fieldName: string = 'date range',
    ): void {
        if (endDate && startDate > endDate) {
            throw new BadRequestException({
                message: `Invalid ${fieldName}: start date cannot be after end date`,
                error: 'InvalidDateRange',
                details: {
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString(),
                },
            });
        }
    }

    /**
     * Validate time range (in minutes)
     *
     * Ensures that start time is before end time.
     *
     * @param startMin - Start time in minutes from midnight (0-1439)
     * @param endMin - End time in minutes from midnight (0-1439)
     * @param fieldName - Name of the field for error message (default: 'time range')
     * @throws BadRequestException if start time is after or equal to end time
     */
    validateTimeRange(
        startMin: number,
        endMin: number,
        fieldName: string = 'time range',
    ): void {
        if (startMin >= endMin) {
            throw new BadRequestException({
                message: `Invalid ${fieldName}: start time (${this.formatMinutes(startMin)}) must be before end time (${this.formatMinutes(endMin)})`,
                error: 'InvalidTimeRange',
                details: {
                    startMin,
                    endMin,
                    startTime: this.formatMinutes(startMin),
                    endTime: this.formatMinutes(endMin),
                },
            });
        }
    }

    /**
     * Validate numeric range
     *
     * Ensures that a number falls within a specified range.
     *
     * @param value - Value to validate
     * @param min - Minimum allowed value (inclusive)
     * @param max - Maximum allowed value (inclusive)
     * @param fieldName - Name of the field for error message
     * @throws BadRequestException if value is outside range
     */
    validateNumericRange(
        value: number,
        min: number,
        max: number,
        fieldName: string,
    ): void {
        if (value < min || value > max) {
            throw new BadRequestException({
                message: `Invalid ${fieldName}: value (${value}) must be between ${min} and ${max}`,
                error: 'InvalidNumericRange',
                details: {
                    value,
                    min,
                    max,
                },
            });
        }
    }

    /**
     * Validate that at least one value is provided
     *
     * Useful for update operations where at least one field must be specified.
     *
     * @param values - Object with values to check
     * @param fieldNames - Names of fields that were checked
     * @throws BadRequestException if no values provided
     */
    validateAtLeastOneValue(
        values: Record<string, any>,
        fieldNames: string[] = [],
    ): void {
        const hasValue = Object.values(values).some(
            (v) => v !== undefined && v !== null,
        );

        if (!hasValue) {
            const fields = fieldNames.length > 0 ? fieldNames.join(', ') : 'fields';
            throw new BadRequestException({
                message: `At least one value must be provided for: ${fields}`,
                error: 'NoValuesProvided',
                details: {
                    fields: fieldNames,
                },
            });
        }
    }

    /**
     * Validate array length
     *
     * Ensures that an array has a minimum and/or maximum length.
     *
     * @param array - Array to validate
     * @param min - Minimum length (optional)
     * @param max - Maximum length (optional)
     * @param fieldName - Name of the field for error message
     * @throws BadRequestException if array length is invalid
     */
    validateArrayLength(
        array: any[],
        min: number | null,
        max: number | null,
        fieldName: string,
    ): void {
        if (min !== null && array.length < min) {
            throw new BadRequestException({
                message: `${fieldName} must contain at least ${min} item(s)`,
                error: 'ArrayTooShort',
                details: {
                    length: array.length,
                    min,
                },
            });
        }

        if (max !== null && array.length > max) {
            throw new BadRequestException({
                message: `${fieldName} must contain at most ${max} item(s)`,
                error: 'ArrayTooLong',
                details: {
                    length: array.length,
                    max,
                },
            });
        }
    }

    /**
     * Format minutes to HH:MM string
     * Helper method for time validation error messages
     */
    private formatMinutes(totalMin: number): string {
        const hours = Math.floor(totalMin / 60);
        const minutes = totalMin % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
}
