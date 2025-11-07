import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

/**
 * Metadata key for roles
 */
export const ROLES_KEY = 'roles';

/**
 * Roles Decorator
 *
 * Marks an endpoint as requiring specific roles for access.
 * Must be used in combination with RolesGuard.
 *
 * Usage:
 * ```typescript
 * @Roles(Role.ADMIN)
 * @Get('users')
 * async getAllUsers() { ... }
 *
 * @Roles(Role.ADMIN, Role.SUPPORT)
 * @Get('tickets')
 * async getAllTickets() { ... }
 * ```
 *
 * Behavior:
 * - If user has ANY of the specified roles, access is granted
 * - Requires JwtAuthGuard to run first (to populate req.user)
 * - Returns 403 Forbidden if user role doesn't match
 *
 * @param roles - One or more roles that can access this endpoint
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
