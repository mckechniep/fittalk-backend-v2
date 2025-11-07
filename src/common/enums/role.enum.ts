/**
 * User Role Enum
 *
 * Defines the access levels within the FitTalk application.
 *
 * Role Hierarchy (highest to lowest):
 * 1. ADMIN - Full system access, user management, configuration
 * 2. SUPPORT - Customer support operations, ticket management
 * 3. USER - Standard application user
 *
 * Usage:
 * - Stored in User.role column (Prisma schema)
 * - Validated via @Roles() decorator + RolesGuard
 * - Extracted from JWT token app_metadata.role
 */
export enum Role {
  /**
   * Administrator role
   * - Full access to all system operations
   * - User management (suspend, delete, view details)
   * - System statistics and analytics
   * - Audit log access
   * - Support ticket management
   */
  ADMIN = 'ADMIN',

  /**
   * Support staff role
   * - View and respond to support tickets
   * - View user details (limited)
   * - Cannot modify users or system settings
   * - Access to support-related audit logs
   */
  SUPPORT = 'SUPPORT',

  /**
   * Standard user role
   * - Default role for all registered users
   * - Access to own data and standard features
   * - Cannot access admin or support endpoints
   */
  USER = 'USER',
}

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
