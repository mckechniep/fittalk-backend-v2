import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SanitizationPipe } from '../../common/pipes/sanitization.pipe';
import { AuditLoggingInterceptor } from '../../common/interceptors/audit-logging.interceptor';
import { AuditEntity } from '../../common/decorators/audit-entity.decorator';
import {
  AdminListUsers,
  AdminGetUser,
  AdminSuspendUser,
  AdminUnsuspendUser,
  AdminUpdateRole,
  AdminDeleteUser,
  AdminGetStats,
  AdminAuditLogs,
} from '../../common/guards/throttler/throttler.decorators';
import {
  ListUsersQueryDto,
  SuspendUserDto,
  UpdateUserRoleDto,
  AdminUserResponseDto,
  PaginatedUsersResponseDto,
  SystemStatsResponseDto,
  AuditLogQueryDto,
  PaginatedAuditLogsResponseDto,
} from './dtos';

/**
 * Admin Controller
 *
 * Provides administrative endpoints for system management.
 *
 * Security:
 * - All endpoints require ADMIN role (@Roles(Role.ADMIN))
 * - All mutations are logged via AuditLoggingInterceptor
 * - Rate limiting applied per endpoint
 * - Input sanitization via SanitizationPipe
 *
 * Responsibilities:
 * - User management (list, view, suspend, delete, role changes)
 * - System statistics and monitoring
 * - Audit log access
 */
@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@UseInterceptors(AuditLoggingInterceptor)
@UsePipes(new SanitizationPipe())
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /**
   * GET /admin/users
   *
   * List all users with pagination and filters.
   *
   * Query parameters:
   * - page: Page number (default: 1)
   * - limit: Items per page (default: 20, max: 100)
   * - email: Filter by email (partial match)
   * - role: Filter by role (ADMIN, SUPPORT, USER)
   * - suspendedOnly: Show only suspended users
   * - sortBy: Sort field (default: createdAt)
   * - sortOrder: asc or desc (default: desc)
   *
   * Returns: Paginated list of users with basic info and stats
   */
  @Get('users')
  @AdminListUsers()
  @ApiOperation({ summary: 'List all users with filters and pagination' })
  @ApiResponse({
    status: 200,
    description: 'Users retrieved successfully',
    type: PaginatedUsersResponseDto,
  })
  async listUsers(@Query() query: ListUsersQueryDto): Promise<PaginatedUsersResponseDto> {
    return this.adminService.listUsers(query);
  }

  /**
   * GET /admin/users/:id
   *
   * Get detailed information for a specific user.
   *
   * Includes:
   * - Profile information
   * - Activity statistics
   * - Suspension status
   * - Role and permissions
   */
  @Get('users/:id')
  @AdminGetUser()
  @ApiOperation({ summary: 'Get detailed user information' })
  @ApiResponse({
    status: 200,
    description: 'User details retrieved successfully',
    type: AdminUserResponseDto,
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserDetails(@Param('id', ParseUUIDPipe) userId: string): Promise<AdminUserResponseDto> {
    return this.adminService.getUserDetails(userId);
  }

  /**
   * POST /admin/users/:id/suspend
   *
   * Suspend user account and restrict access.
   *
   * Effects:
   * - User cannot log in (JWT validation fails)
   * - All active sessions terminated
   * - Suspension reason recorded
   * - Admin who suspended is tracked
   *
   * Restrictions:
   * - Cannot suspend yourself
   * - Cannot suspend other admins
   */
  @Post('users/:id/suspend')
  @AdminSuspendUser()
  @AuditEntity('User')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspend user account' })
  @ApiResponse({
    status: 200,
    description: 'User suspended successfully',
    type: AdminUserResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid operation (self-suspension, admin suspension)' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async suspendUser(
    @CurrentUser('id') adminId: string,
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: SuspendUserDto,
  ): Promise<AdminUserResponseDto> {
    return this.adminService.suspendUser(adminId, userId, dto);
  }

  /**
   * POST /admin/users/:id/unsuspend
   *
   * Restore suspended user account.
   *
   * Effects:
   * - User can log in again
   * - Suspension fields cleared
   */
  @Post('users/:id/unsuspend')
  @AdminUnsuspendUser()
  @AuditEntity('User')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unsuspend user account' })
  @ApiResponse({
    status: 200,
    description: 'User unsuspended successfully',
    type: AdminUserResponseDto,
  })
  @ApiResponse({ status: 400, description: 'User is not suspended' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async unsuspendUser(
    @CurrentUser('id') adminId: string,
    @Param('id', ParseUUIDPipe) userId: string,
  ): Promise<AdminUserResponseDto> {
    return this.adminService.unsuspendUser(adminId, userId);
  }

  /**
   * PATCH /admin/users/:id/role
   *
   * Update user role (promote/demote).
   *
   * Use cases:
   * - Promote USER to SUPPORT
   * - Promote SUPPORT to ADMIN
   * - Demote ADMIN to USER
   *
   * Restrictions:
   * - Cannot demote yourself from ADMIN
   */
  @Patch('users/:id/role')
  @AdminUpdateRole()
  @AuditEntity('User')
  @ApiOperation({ summary: 'Update user role' })
  @ApiResponse({
    status: 200,
    description: 'User role updated successfully',
    type: AdminUserResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Cannot change own role' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateUserRole(
    @CurrentUser('id') adminId: string,
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateUserRoleDto,
  ): Promise<AdminUserResponseDto> {
    return this.adminService.updateUserRole(adminId, userId, dto);
  }

  /**
   * DELETE /admin/users/:id
   *
   * Permanently delete user account.
   *
   * ⚠️ WARNING: This is irreversible!
   *
   * Effects:
   * - User account permanently deleted
   * - All related data cascade deleted (Prisma onDelete: Cascade)
   * - Cannot be undone
   *
   * Restrictions:
   * - Cannot delete yourself
   * - Cannot delete other admins
   *
   * Use cases:
   * - GDPR data deletion requests
   * - Test account cleanup
   * - Ban evasion prevention
   */
  @Delete('users/:id')
  @AdminDeleteUser()
  @AuditEntity('User')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently delete user account' })
  @ApiResponse({ status: 204, description: 'User deleted successfully' })
  @ApiResponse({ status: 400, description: 'Cannot delete self or admin accounts' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async deleteUser(
    @CurrentUser('id') adminId: string,
    @Param('id', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    return this.adminService.deleteUser(adminId, userId);
  }

  /**
   * GET /admin/stats
   *
   * Get system statistics and health metrics.
   *
   * Includes:
   * - User counts (total, active, suspended, by role)
   * - Activity metrics (workout logs, meal logs, goals)
   * - Support statistics (tickets, resolution time)
   * - System health (database, redis, uptime)
   *
   * Use cases:
   * - Admin dashboard
   * - System monitoring
   * - Health checks
   */
  @Get('stats')
  @AdminGetStats()
  @ApiOperation({ summary: 'Get system statistics and health' })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
    type: SystemStatsResponseDto,
  })
  async getSystemStats(): Promise<SystemStatsResponseDto> {
    return this.adminService.getSystemStats();
  }

  /**
   * GET /admin/audit-logs
   *
   * Search and view audit logs.
   *
   * Query parameters:
   * - page, limit: Pagination
   * - userId: Filter by user affected
   * - actorId: Filter by admin who performed action
   * - action: Filter by action type (CREATE, UPDATE, DELETE)
   * - entityType: Filter by entity (User, WorkoutLog, etc.)
   * - entityId: Filter by specific entity ID
   * - startDate, endDate: Date range filter
   *
   * Use cases:
   * - Security auditing
   * - Compliance reporting
   * - Debugging user issues
   * - Admin action tracking
   */
  @Get('audit-logs')
  @AdminAuditLogs()
  @ApiOperation({ summary: 'Search audit logs' })
  @ApiResponse({
    status: 200,
    description: 'Audit logs retrieved successfully',
    type: PaginatedAuditLogsResponseDto,
  })
  async getAuditLogs(@Query() query: AuditLogQueryDto): Promise<PaginatedAuditLogsResponseDto> {
    return this.adminService.getAuditLogs(query);
  }
}
