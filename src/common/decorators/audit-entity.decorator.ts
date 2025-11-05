import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for storing audit entity type on controllers
 */
export const AUDIT_ENTITY_KEY = 'audit:entityType';

/**
 * Audit Entity Decorator
 *
 * Marks a controller or route handler with the entity type for audit logging.
 * This replaces the error-prone string-based route parsing approach with
 * explicit, type-safe metadata.
 *
 * Benefits:
 * - Type-safe and explicit entity type declaration
 * - No brittle string parsing of URLs
 * - Easy to see what's being audited in the controller code
 * - Follows NestJS metadata best practices
 * - Supports both controller-level and route-level decoration
 *
 * Usage:
 * ```typescript
 * // Controller-level (applies to all routes)
 * @Controller('nutrition/foods')
 * @AuditEntity('FoodItem')
 * export class NutritionController {
 *   // All routes inherit 'FoodItem' entity type
 * }
 *
 * // Route-level (overrides controller-level)
 * @Controller('nutrition')
 * @AuditEntity('FoodItem')
 * export class NutritionController {
 *   @Post('meals')
 *   @AuditEntity('MealLog')  // Overrides to 'MealLog' for this route
 *   createMeal() { }
 * }
 * ```
 *
 * @param entityType - The type of entity being operated on (e.g., 'FoodItem', 'MacroTarget')
 * @returns Decorator function that sets metadata
 */
export const AuditEntity = (entityType: string) => SetMetadata(AUDIT_ENTITY_KEY, entityType);
