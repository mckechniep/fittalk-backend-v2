// common/exceptions/nutrition.exceptions.ts
import {
    NotFoundException,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';

/**
 * Custom nutrition-specific exceptions
 *
 * Benefits:
 * - Clear, domain-specific error messages
 * - Easier to track in logs and monitoring
 * - Consistent error handling patterns
 * - Better client-side error handling
 */

// ==================== Food Item Exceptions ====================

export class FoodItemNotFoundException extends NotFoundException {
    constructor(foodItemId: string) {
        super({
            message: `Food item with ID "${foodItemId}" not found`,
            error: 'FoodItemNotFound',
            foodItemId,
        });
    }
}

export class InvalidFoodItemDataException extends BadRequestException {
    constructor(message: string, details?: any) {
        super({
            message: `Invalid food item data: ${message}`,
            error: 'InvalidFoodItemData',
            details,
        });
    }
}

export class FoodItemAlreadyExistsException extends BadRequestException {
    constructor(name: string) {
        super({
            message: `Food item "${name}" already exists`,
            error: 'FoodItemAlreadyExists',
            name,
        });
    }
}

// ==================== Meal Log Exceptions ====================

export class MealLogNotFoundException extends NotFoundException {
    constructor(mealLogId: string) {
        super({
            message: `Meal log with ID "${mealLogId}" not found`,
            error: 'MealLogNotFound',
            mealLogId,
        });
    }
}

export class MealLogNotOwnedException extends ForbiddenException {
    constructor(mealLogId: string, userId: string) {
        super({
            message: `Meal log "${mealLogId}" is not owned by user "${userId}"`,
            error: 'MealLogNotOwned',
            mealLogId,
            userId,
        });
    }
}

export class InvalidMealLogDataException extends BadRequestException {
    constructor(message: string, details?: any) {
        super({
            message: `Invalid meal log data: ${message}`,
            error: 'InvalidMealLogData',
            details,
        });
    }
}

export class EmptyMealException extends BadRequestException {
    constructor() {
        super({
            message: 'Meal must contain at least one food item',
            error: 'EmptyMeal',
        });
    }
}

// ==================== Macro Target Exceptions ====================

export class MacroTargetNotFoundException extends NotFoundException {
    constructor(targetId?: string) {
        const message = targetId
            ? `Macro target with ID "${targetId}" not found`
            : 'No active macro target found';
        super({
            message,
            error: 'MacroTargetNotFound',
            targetId,
        });
    }
}

export class MacroTargetNotOwnedException extends ForbiddenException {
    constructor(targetId: string, userId: string) {
        super({
            message: `Macro target "${targetId}" is not owned by user "${userId}"`,
            error: 'MacroTargetNotOwned',
            targetId,
            userId,
        });
    }
}

export class InvalidMacroTargetException extends BadRequestException {
    constructor(message: string, details?: any) {
        super({
            message: `Invalid macro target: ${message}`,
            error: 'InvalidMacroTarget',
            details,
        });
    }
}

export class MacroTargetDateConflictException extends BadRequestException {
    constructor(existingTargetId: string) {
        super({
            message: 'Macro target date range conflicts with existing target',
            error: 'MacroTargetDateConflict',
            existingTargetId,
        });
    }
}

// ==================== Grocery List Exceptions ====================

export class GroceryListNotFoundException extends NotFoundException {
    constructor(listId: string) {
        super({
            message: `Grocery list with ID "${listId}" not found`,
            error: 'GroceryListNotFound',
            listId,
        });
    }
}

export class GroceryListNotOwnedException extends ForbiddenException {
    constructor(listId: string, userId: string) {
        super({
            message: `Grocery list "${listId}" is not owned by user "${userId}"`,
            error: 'GroceryListNotOwned',
            listId,
            userId,
        });
    }
}

export class InvalidGroceryListDataException extends BadRequestException {
    constructor(message: string, details?: any) {
        super({
            message: `Invalid grocery list data: ${message}`,
            error: 'InvalidGroceryListData',
            details,
        });
    }
}

// ==================== General Nutrition Exceptions ====================

export class NutritionDataInconsistentException extends BadRequestException {
    constructor(message: string, data?: any) {
        super({
            message: `Nutrition data inconsistency: ${message}`,
            error: 'NutritionDataInconsistent',
            data,
        });
    }
}

export class NutritionCalculationException extends BadRequestException {
    constructor(message: string) {
        super({
            message: `Nutrition calculation error: ${message}`,
            error: 'NutritionCalculationError',
        });
    }
}
