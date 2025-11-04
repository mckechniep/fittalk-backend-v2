// types/prisma-to-dto.types.ts
import { Decimal } from '@prisma/client/runtime/library';
import { FoodItem, GroceryList, GroceryItem, MacroTarget } from '@prisma/client';

/**
 * Type guard to check if a value is a Prisma Decimal
 */
export function isDecimal(value: unknown): value is Decimal {
    return value instanceof Decimal ||
           (typeof value === 'object' &&
            value !== null &&
            'toNumber' in value &&
            typeof (value as { toNumber: unknown }).toNumber === 'function');
}

/**
 * Safely convert Decimal to number
 */
export function decimalToNumber(value: Decimal | number): number {
    if (typeof value === 'number') return value;
    return isDecimal(value) ? value.toNumber() : Number(value);
}

/**
 * FoodItem with included relations for type safety
 */
export type FoodItemWithRelations = FoodItem & {
    groceryItems?: GroceryItem[];
};

/**
 * GroceryList with included relations
 */
export type GroceryListWithRelations = GroceryList & {
    items: Array<GroceryItem & {
        foodItem: FoodItem | null;
    }>;
};

/**
 * Type representing what Prisma actually returns after includes
 */
export type PrismaFoodItem = FoodItem;
export type PrismaGroceryList = GroceryList & {
    items: Array<GroceryItem & { foodItem: FoodItem | null }>;
};
export type PrismaMacroTarget = MacroTarget;
