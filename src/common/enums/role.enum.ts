/**
 * User Role Utilities
 *
 * Re-exports the Role enum from Prisma (single source of truth)
 * and provides helper functions for role validation and hierarchy.
 *
 * Role Hierarchy (highest to lowest):
 * 1. ADMIN - Full system access, user management, configuration
 * 2. SUPPORT - Customer support operations, ticket management
 * 3. USER - Standard application user
 *
 * Usage:
 * - Stored in User.role column (Prisma schema)
 * - Validated via @Roles() decorator + RolesGuard
 * - Source of truth: Prisma database schema
 */
import { Role } from '@prisma/client';

// Re-export Role enum from Prisma (single source of truth)
export { Role };

/**
 * Type guard to check if a string is a valid Role
 */
export function isValidRole(role: string): role is Role {
  return Object.values(Role).includes(role as Role);
}

/**
 * Get all roles with access level >= specified role
 * Useful for hierarchical permission checks
 */
export function getRolesWithMinimumLevel(minimumRole: Role): Role[] {
  const hierarchy = [Role.ADMIN, Role.SUPPORT, Role.USER];
  const minIndex = hierarchy.indexOf(minimumRole);
  return hierarchy.slice(0, minIndex + 1);
}
