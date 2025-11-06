import { Injectable, NotFoundException, Logger, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProfileDto } from './dtos/create-profile.dto';
import { UpdateProfileDto } from './dtos/update-profile.dto';
import { handlePrismaError } from '../../common/utils/prisma-error.handler';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  /**
   * Get current user with relations
   */
  async getCurrentUser(userId: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          profile: true,
          preferences: true,
          devices: {
            where: { revokedAt: null },
          },
        },
      });

      if (!user) {
        throw new NotFoundException({
          message: 'User not found',
          error: 'UserNotFound',
        });
      }

      // Exclude sensitive fields
      const { passwordHash, ...userData } = user;
      return userData;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'get current user');
    }
  }

  /**
   * Create or update user profile
   * For CREATE: firstname and lastname are required
   * For UPDATE: only provided fields are updated
   */
  async createOrUpdateProfile(
    userId: string,
    dto: CreateProfileDto | UpdateProfileDto,
  ) {
    try {
      // Check if we're doing a create or update by checking if profile exists
      const existingProfile = await this.prisma.profile.findUnique({
        where: { userId },
      });

      if (existingProfile) {
        // UPDATE: only update provided fields
        this.logger.log(`Updating profile for user ${userId}`);

        const profile = await this.prisma.profile.update({
          where: { userId },
          data: {
            /* If you see errors here it's probably because Prisma schema defines the enums,
            so they're not available in TypeScript until the Prisma client needs to be regenerated. */
            // pnpm prisma generate -> fixed these errors
            ...(dto.firstname !== undefined && { firstname: dto.firstname }),
            ...(dto.lastname !== undefined && { lastname: dto.lastname }),
            ...(dto.sex !== undefined && { sex: dto.sex }),
            ...(dto.heightCm !== undefined && { heightCm: dto.heightCm }),
            ...(dto.weightKg !== undefined && { weightKg: dto.weightKg }),
            ...(dto.experienceLevel !== undefined && {
              experienceLevel: dto.experienceLevel,
            }),
            ...(dto.healthNotes !== undefined && {
              healthNotes: dto.healthNotes,
            }),
            ...(dto.goalType !== undefined && { goalType: dto.goalType }),
            ...(dto.unitSystem !== undefined && { unitSystem: dto.unitSystem }),
          },
        });

        this.logger.log(`Successfully updated profile for user ${userId}`);
        return profile;
      } else {
        // CREATE: firstname and lastname are required
        this.logger.log(`Creating profile for user ${userId}`);

        const createDto = dto as CreateProfileDto;
        const profile = await this.prisma.profile.create({
          data: {
            userId,
            firstname: createDto.firstname,
            lastname: createDto.lastname,
            sex: createDto.sex,
            heightCm: createDto.heightCm,
            weightKg: createDto.weightKg,
            experienceLevel: createDto.experienceLevel,
            healthNotes: createDto.healthNotes,
            goalType: createDto.goalType,
            unitSystem: createDto.unitSystem,
          },
        });

        this.logger.log(`Successfully created profile for user ${userId}`);
        return profile;
      }
    } catch (error) {
      handlePrismaError(error, this.logger, 'create or update profile');
    }
  }

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId: string) {
    try {
      const sessions = await this.prisma.session.findMany({
        where: {
          userId,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });

      return sessions;
    } catch (error) {
      handlePrismaError(error, this.logger, 'get user sessions');
    }
  }

  /**
   * Revoke a specific session
   */
  async revokeSession(userId: string, sessionId: string) {
    try {
      const session = await this.prisma.session.findFirst({
        where: {
          jwtId: sessionId,
          userId,
        },
      });

      if (!session) {
        throw new NotFoundException({
          message: 'Session not found',
          error: 'SessionNotFound',
        });
      }

      this.logger.log(`Revoking session ${sessionId} for user ${userId}`);

      await this.prisma.session.update({
        where: { id: session.id },
        data: { expiresAt: new Date() },
      });

      this.logger.log(`Successfully revoked session ${sessionId}`);
      return { message: 'Session revoked successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'revoke session');
    }
  }

  /**
   * Revoke all sessions except the current one
   */
  async revokeAllOtherSessions(userId: string, currentSessionId?: string) {
    try {
      this.logger.log(`Revoking all other sessions for user ${userId}`);

      if (!currentSessionId) {
        // If no current session provided, revoke all sessions
        await this.prisma.session.updateMany({
          where: { userId },
          data: { expiresAt: new Date() },
        });
      } else {
        // Revoke all except current
        await this.prisma.session.updateMany({
          where: {
            userId,
            jwtId: { not: currentSessionId },
          },
          data: { expiresAt: new Date() },
        });
      }

      this.logger.log(`Successfully revoked all other sessions for user ${userId}`);
      return { message: 'All other sessions revoked successfully' };
    } catch (error) {
      handlePrismaError(error, this.logger, 'revoke all other sessions');
    }
  }

  // ==================== DEVICE MANAGEMENT ====================

  /**
   * Register or update a device for push notifications
   */
  async registerDevice(
    userId: string,
    deviceData: {
      platform: string;
      deviceId: string;
      pushToken?: string;
    },
  ) {
    try {
      this.logger.log(`Registering device ${deviceData.deviceId} for user ${userId}`);

      const device = await this.prisma.device.upsert({
        where: { deviceId: deviceData.deviceId },
        create: {
          userId,
          ...deviceData,
        },
        update: {
          pushToken: deviceData.pushToken,
          lastSeenAt: new Date(),
          revokedAt: null,
        },
      });

      this.logger.log(`Successfully registered device ${deviceData.deviceId}`);
      return device;
    } catch (error) {
      handlePrismaError(error, this.logger, 'register device');
    }
  }

  /**
   * Get all user's devices
   */
  async getUserDevices(userId: string) {
    try {
      return this.prisma.device.findMany({
        where: { userId },
        orderBy: { lastSeenAt: 'desc' },
        select: {
          id: true,
          platform: true,
          deviceId: true,
          pushToken: true,
          lastSeenAt: true,
          revokedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (error) {
      handlePrismaError(error, this.logger, 'get user devices');
    }
  }

  /**
   * Update device push token
   */
  async updateDeviceToken(
    userId: string,
    deviceId: string,
    dto: { pushToken?: string },
  ) {
    try {
      // Verify ownership
      const device = await this.prisma.device.findUnique({
        where: { deviceId },
      });

      if (!device) {
        throw new NotFoundException({
          message: 'Device not found',
          error: 'DeviceNotFound',
        });
      }

      if (device.userId !== userId) {
        throw new ForbiddenException({
          message: 'You do not have access to this device',
          error: 'DeviceAccessDenied',
        });
      }

      this.logger.log(`Updating push token for device ${deviceId}`);

      // Update token and mark as active
      const updated = await this.prisma.device.update({
        where: { deviceId },
        data: {
          pushToken: dto.pushToken,
          lastSeenAt: new Date(),
          revokedAt: null, // Re-activate if previously revoked
        },
      });

      this.logger.log(`Successfully updated push token for device ${deviceId}`);
      return updated;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'update device token');
    }
  }

  /**
   * Revoke/delete a device
   */
  async revokeDevice(userId: string, deviceId: string) {
    try {
      // Verify ownership
      const device = await this.prisma.device.findUnique({
        where: { deviceId },
      });

      if (!device) {
        throw new NotFoundException({
          message: 'Device not found',
          error: 'DeviceNotFound',
        });
      }

      if (device.userId !== userId) {
        throw new ForbiddenException({
          message: 'You do not have access to this device',
          error: 'DeviceAccessDenied',
        });
      }

      this.logger.log(`Revoking device ${deviceId} for user ${userId}`);

      // Soft delete
      await this.prisma.device.update({
        where: { deviceId },
        data: { revokedAt: new Date() },
      });

      this.logger.log(`Successfully revoked device ${deviceId}`);
      return { message: 'Device revoked successfully' };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'revoke device');
    }
  }

  /**
   * Verify device exists and is not revoked
   */
  async verifyDevice(userId: string, deviceId: string) {
    try {
      const device = await this.prisma.device.findUnique({
        where: { deviceId },
      });

      // Device not found
      if (!device) {
        return {
          valid: false,
          reason: 'Device not found',
        };
      }

      // Device belongs to different user
      if (device.userId !== userId) {
        return {
          valid: false,
          reason: 'Device does not belong to user',
        };
      }

      // Device is revoked
      if (device.revokedAt) {
        return {
          valid: false,
          reason: 'Device has been revoked',
          revokedAt: device.revokedAt,
        };
      }

      // Device is valid
      return {
        valid: true,
        device: {
          id: device.id,
          platform: device.platform,
          deviceId: device.deviceId,
          lastSeenAt: device.lastSeenAt,
          createdAt: device.createdAt,
        },
      };
    } catch (error) {
      handlePrismaError(error, this.logger, 'verify device');
    }
  }
}