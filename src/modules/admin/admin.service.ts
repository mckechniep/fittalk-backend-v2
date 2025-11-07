import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, Role } from '@prisma/client';
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
import { plainToInstance } from 'class-transformer';

/**
 * Admin Service
 *
 * Handles administrative operations including:
 * - User management (list, suspend, delete, role changes)
 * - System statistics and monitoring
 * - Audit log access
 *
 * All operations are logged via AuditLoggingInterceptor
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * List users with pagination and filters
   */
  async listUsers(query: ListUsersQueryDto): Promise<PaginatedUsersResponseDto> {
    const { page = 1, limit = 20, email, role, suspendedOnly, sortBy = 'createdAt', sortOrder = 'desc' } = query;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.UserWhereInput = {};

    if (email) {
      where.email = { contains: email, mode: 'insensitive' };
    }

    if (role) {
      where.role = role;
    }

    if (suspendedOnly) {
      where.suspendedAt = { not: null };
    }

    // Build orderBy
    const orderBy: Prisma.UserOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    // Execute query
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          profile: {
            select: {
              firstname: true,
              lastname: true,
              sex: true,
              experienceLevel: true,
            },
          },
          _count: {
            select: {
              workoutLogs: true,
              goals: true,
              consultations: true,
            },
          },
          sessions: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    // Transform to DTO
    const userDtos = users.map((user) => {
      const dto = plainToInstance(AdminUserResponseDto, user, {
        excludeExtraneousValues: true,
      });

      // Add stats
      dto.stats = {
        workoutLogsCount: (user._count as any).workoutLogs,
        goalsCount: (user._count as any).goals,
        consultationsCount: (user._count as any).consultations,
        lastActiveAt: user.sessions[0]?.createdAt || null,
      };

      return dto;
    });

    return {
      users: userDtos,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Get detailed user information
   */
  async getUserDetails(userId: string): Promise<AdminUserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: {
          select: {
            firstname: true,
            lastname: true,
            sex: true,
            experienceLevel: true,
          },
        },
        _count: {
          select: {
            workoutLogs: true,
            goals: true,
            consultations: true,
          },
        },
        sessions: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException({
        message: `User with ID "${userId}" not found`,
        error: 'UserNotFound',
        userId,
      });
    }

    const dto = plainToInstance(AdminUserResponseDto, user, {
      excludeExtraneousValues: true,
    });

    dto.stats = {
      workoutLogsCount: (user._count as any).workoutLogs,
      goalsCount: (user._count as any).goals,
      consultationsCount: (user._count as any).consultations,
      lastActiveAt: user.sessions[0]?.createdAt || null,
    };

    return dto;
  }

  /**
   * Suspend user account
   */
  async suspendUser(adminId: string, userId: string, dto: SuspendUserDto): Promise<AdminUserResponseDto> {
    // Check user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException({
        message: `User with ID "${userId}" not found`,
        error: 'UserNotFound',
        userId,
      });
    }

    // Prevent self-suspension
    if (adminId === userId) {
      throw new BadRequestException({
        message: 'Cannot suspend your own account',
        error: 'SelfSuspensionNotAllowed',
      });
    }

    // Prevent suspending other admins
    if (user.role === Role.ADMIN) {
      throw new BadRequestException({
        message: 'Cannot suspend admin accounts',
        error: 'AdminSuspensionNotAllowed',
      });
    }

    // Already suspended?
    if (user.suspendedAt) {
      throw new BadRequestException({
        message: 'User is already suspended',
        error: 'AlreadySuspended',
      });
    }

    this.logger.log(`Admin ${adminId} suspending user ${userId}: ${dto.reason}`);

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        suspendedAt: new Date(),
        suspendedReason: dto.reason,
        suspendedBy: adminId,
      },
      include: {
        profile: {
          select: {
            firstname: true,
            lastname: true,
            sex: true,
            experienceLevel: true,
          },
        },
      },
    });

    return plainToInstance(AdminUserResponseDto, updatedUser, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Unsuspend user account
   */
  async unsuspendUser(adminId: string, userId: string): Promise<AdminUserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException({
        message: `User with ID "${userId}" not found`,
        error: 'UserNotFound',
        userId,
      });
    }

    if (!user.suspendedAt) {
      throw new BadRequestException({
        message: 'User is not suspended',
        error: 'NotSuspended',
      });
    }

    this.logger.log(`Admin ${adminId} unsuspending user ${userId}`);

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        suspendedAt: null,
        suspendedReason: null,
        suspendedBy: null,
      },
      include: {
        profile: {
          select: {
            firstname: true,
            lastname: true,
            sex: true,
            experienceLevel: true,
          },
        },
      },
    });

    return plainToInstance(AdminUserResponseDto, updatedUser, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Update user role
   */
  async updateUserRole(adminId: string, userId: string, dto: UpdateUserRoleDto): Promise<AdminUserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException({
        message: `User with ID "${userId}" not found`,
        error: 'UserNotFound',
        userId,
      });
    }

    // Prevent self-demotion from admin
    if (adminId === userId && dto.role !== Role.ADMIN) {
      throw new BadRequestException({
        message: 'Cannot change your own admin role',
        error: 'SelfRoleChangeNotAllowed',
      });
    }

    this.logger.log(`Admin ${adminId} changing user ${userId} role: ${user.role} → ${dto.role}`);

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        role: dto.role,
      },
      include: {
        profile: {
          select: {
            firstname: true,
            lastname: true,
            sex: true,
            experienceLevel: true,
          },
        },
      },
    });

    return plainToInstance(AdminUserResponseDto, updatedUser, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Delete user permanently
   */
  async deleteUser(adminId: string, userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException({
        message: `User with ID "${userId}" not found`,
        error: 'UserNotFound',
        userId,
      });
    }

    // Prevent self-deletion
    if (adminId === userId) {
      throw new BadRequestException({
        message: 'Cannot delete your own account',
        error: 'SelfDeletionNotAllowed',
      });
    }

    // Prevent deleting other admins
    if (user.role === Role.ADMIN) {
      throw new BadRequestException({
        message: 'Cannot delete admin accounts',
        error: 'AdminDeletionNotAllowed',
      });
    }

    this.logger.warn(`Admin ${adminId} DELETING user ${userId} (${user.email})`);

    await this.prisma.user.delete({
      where: { id: userId },
    });
  }

  /**
   * Get system statistics
   */
  async getSystemStats(): Promise<SystemStatsResponseDto> {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // User stats
    const [
      totalUsers,
      suspendedUsers,
      newUsersThisMonth,
      usersByRole,
      totalWorkoutLogs,
      totalMealLogs,
      totalGoals,
      totalConsultations,
      activeSessions,
      totalTickets,
      openTickets,
      resolvedTickets,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { suspendedAt: { not: null } } }),
      this.prisma.user.count({ where: { createdAt: { gte: firstDayOfMonth } } }),
      this.prisma.user.groupBy({
        by: ['role'],
        _count: true,
      }),
      this.prisma.workoutLog.count(),
      this.prisma.mealLog.count(),
      this.prisma.userGoal.count(),
      this.prisma.consultationSession.count(),
      this.prisma.liveWorkoutSession.count({
        where: {
          endedAt: null,
        },
      }),
      this.prisma.supportTicket.count(),
      this.prisma.supportTicket.count({
        where: {
          status: { in: ['OPEN', 'IN_PROGRESS'] },
        },
      }),
      this.prisma.supportTicket.count({
        where: {
          status: 'RESOLVED',
        },
      }),
    ]);

    const byRoleMap: Record<string, number> = {};
    usersByRole.forEach((item) => {
      byRoleMap[item.role] = item._count;
    });

    // Calculate active users (had activity in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const activeUsers = await this.prisma.user.count({
      where: {
        OR: [
          { workoutLogs: { some: { createdAt: { gte: thirtyDaysAgo } } } },
          { mealLogs: { some: { createdAt: { gte: thirtyDaysAgo } } } },
          { sessions: { some: { createdAt: { gte: thirtyDaysAgo } } } },
        ],
      },
    });

    // System health checks
    let databaseStatus: 'healthy' | 'degraded' | 'down' = 'healthy';
    let redisStatus: 'healthy' | 'degraded' | 'down' = 'healthy';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      this.logger.error('Database health check failed', error);
      databaseStatus = 'down';
    }

    // TODO: Add Redis health check when Redis service is injected
    // For now, assume healthy
    redisStatus = 'healthy';

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        suspended: suspendedUsers,
        newThisMonth: newUsersThisMonth,
        byRole: byRoleMap,
      },
      activity: {
        totalWorkoutLogs,
        totalMealLogs,
        totalGoals,
        totalConsultations,
        activeSessionsCount: activeSessions,
      },
      support: {
        totalTickets,
        openTickets,
        resolvedTickets,
        avgResolutionTimeHours: null, // TODO: Calculate from createdAt to resolvedAt
      },
      system: {
        databaseStatus,
        redisStatus,
        uptimeSeconds: process.uptime(),
      },
    };
  }

  /**
   * Get audit logs with filters
   */
  async getAuditLogs(query: AuditLogQueryDto): Promise<PaginatedAuditLogsResponseDto> {
    const { page = 1, limit = 50, userId, actorId, action, entityType, entityId, startDate, endDate } = query;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.AuditLogWhereInput = {};

    if (userId) where.userId = userId;
    if (actorId) where.actorId = actorId;
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }
}
