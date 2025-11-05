import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';

/**
 * Ownership Validator Service
 *
 * Centralized service for validating resource ownership across the application.
 * Eliminates code duplication and ensures consistent ownership validation patterns.
 *
 * Features:
 * - Generic type-safe validation for any entity with userId
 * - Consistent error messages and logging
 * - Support for soft-deleted entities (deletedAt check)
 * - Customizable entity names for error messages
 *
 * Usage:
 * ```typescript
 * const macroTarget = await this.prisma.macroTarget.findFirst({ where: { id, deletedAt: null } });
 * await this.ownershipValidator.validateOwnership(
 *   macroTarget,
 *   userId,
 *   'MacroTarget',
 *   id
 * );
 * ```
 */
@Injectable()
export class OwnershipValidator {
    private readonly logger = new Logger(OwnershipValidator.name);

    /**
     * Validate that an entity exists and is owned by the specified user
     *
     * @param entity - The entity to validate (can be null if not found)
     * @param userId - The ID of the user who should own the entity
     * @param entityType - Human-readable entity type for error messages (e.g., 'MacroTarget', 'GroceryList')
     * @param entityId - The ID of the entity being accessed
     * @returns The validated entity (guaranteed to be non-null)
     * @throws NotFoundException if entity is null or undefined
     * @throws ForbiddenException if entity.userId doesn't match userId
     *
     * @template T - Entity type that must have a userId property
     */
    validateOwnership<T extends { userId: string }>(
        entity: T | null | undefined,
        userId: string,
        entityType: string,
        entityId: string,
    ): T {
        // Check if entity exists
        if (!entity) {
            this.logger.warn(`${entityType} ${entityId} not found`);
            throw new NotFoundException({
                message: `${entityType} not found`,
                error: `${entityType}NotFound`,
                [`${this.toLowerCamelCase(entityType)}Id`]: entityId,
            });
        }

        // Check ownership
        if (entity.userId !== userId) {
            this.logger.warn(
                `Unauthorized access attempt: user ${userId} tried to access ${entityType} ${entityId} owned by ${entity.userId}`
            );
            throw new ForbiddenException({
                message: `You do not have access to this ${this.toDisplayName(entityType)}`,
                error: `${entityType}NotOwned`,
                [`${this.toLowerCamelCase(entityType)}Id`]: entityId,
                userId,
            });
        }

        return entity;
    }

    /**
     * Validate ownership with custom not found exception
     *
     * Use this when you need to throw domain-specific exceptions
     *
     * @param entity - The entity to validate
     * @param userId - The ID of the user who should own the entity
     * @param entityType - Human-readable entity type
     * @param entityId - The ID of the entity
     * @param notFoundException - Custom exception to throw if entity not found
     * @param notOwnedException - Custom exception to throw if ownership validation fails
     * @returns The validated entity
     * @throws Custom exceptions provided
     *
     * @template T - Entity type that must have a userId property
     */
    validateOwnershipWithCustomExceptions<T extends { userId: string }>(
        entity: T | null | undefined,
        userId: string,
        entityType: string,
        entityId: string,
        notFoundException: Error,
        notOwnedException: Error,
    ): T {
        // Check if entity exists
        if (!entity) {
            this.logger.warn(`${entityType} ${entityId} not found`);
            throw notFoundException;
        }

        // Check ownership
        if (entity.userId !== userId) {
            this.logger.warn(
                `Unauthorized access attempt: user ${userId} tried to access ${entityType} ${entityId} owned by ${entity.userId}`
            );
            throw notOwnedException;
        }

        return entity;
    }

    /**
     * Convert entity type to lower camelCase for property names
     * e.g., 'MacroTarget' → 'macroTarget', 'GroceryList' → 'groceryList'
     */
    private toLowerCamelCase(str: string): string {
        return str.charAt(0).toLowerCase() + str.slice(1);
    }

    /**
     * Convert entity type to display name with spaces
     * e.g., 'MacroTarget' → 'macro target', 'GroceryList' → 'grocery list'
     */
    private toDisplayName(str: string): string {
        return str
            .replace(/([A-Z])/g, ' $1')
            .trim()
            .toLowerCase();
    }
}
