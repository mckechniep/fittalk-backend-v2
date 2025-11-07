import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../enums/role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Roles Guard
 *
 * Validates that the authenticated user has one of the required roles
 * to access the endpoint.
 *
 * Requirements:
 * - Must run AFTER JwtAuthGuard (requires req.user to be populated)
 * - Endpoint must be decorated with @Roles(...roles)
 * - User.role must be set in database or JWT app_metadata
 *
 * Behavior:
 * - If @Roles() is not present, allows access (no role requirement)
 * - If @Roles() is present, checks if user.role matches any required role
 * - Throws 403 Forbidden if role doesn't match
 * - Logs all role violations for security monitoring
 *
 * Usage:
 * ```typescript
 * @Controller('admin')
 * @UseGuards(JwtAuthGuard, RolesGuard) // JwtAuthGuard MUST come first
 * export class AdminController {
 *   @Roles(Role.ADMIN)
 *   @Get('users')
 *   getAllUsers() { ... }
 * }
 * ```
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Get required roles from @Roles() decorator
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no @Roles() decorator, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // Extract user from request (set by JwtAuthGuard)
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Validate user exists
    if (!user) {
      this.logger.error('RolesGuard: user not found in request. JwtAuthGuard must run first.');
      throw new ForbiddenException({
        message: 'Authentication required before role validation',
        error: 'AuthenticationMissing',
      });
    }

    // Extract user role (from database or JWT metadata)
    const userRole = user.role;

    // Check if user has a role
    if (!userRole) {
      this.logRoleViolation(user, requiredRoles, null, request);
      throw new ForbiddenException({
        message: 'User does not have an assigned role',
        error: 'RoleMissing',
      });
    }

    // Check if user role matches any required role
    const hasRequiredRole = requiredRoles.includes(userRole);

    if (!hasRequiredRole) {
      this.logRoleViolation(user, requiredRoles, userRole, request);
      throw new ForbiddenException({
        message: 'You do not have permission to access this resource',
        error: 'InsufficientPermissions',
        details: {
          required: requiredRoles,
          current: userRole,
        },
      });
    }

    // Log successful access for security audit
    this.logger.log(
      `Role access granted: User ${user.id} (${userRole}) → ${request.method} ${request.path}`,
    );

    return true;
  }

  /**
   * Log role-based access violations for security monitoring
   */
  private logRoleViolation(
    user: any,
    requiredRoles: Role[],
    userRole: Role | null,
    request: any,
  ): void {
    this.logger.warn(
      `Role access denied: ` +
        `User ${user.id} | ` +
        `Current role: ${userRole || 'NONE'} | ` +
        `Required: ${requiredRoles.join(' OR ')} | ` +
        `Endpoint: ${request.method} ${request.path} | ` +
        `IP: ${request.ip || 'unknown'}`,
    );

    // TODO: Implement security alert for repeated violations
    // - Track violations by user ID
    // - Alert on > 5 violations in 5 minutes
    // - Consider temporary account suspension for repeated attempts
  }
}
