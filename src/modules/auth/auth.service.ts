import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  /**
   * Get current user with relations
   */
  async getCurrentUser(userId: string) {
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
      throw new NotFoundException('User not found');
    }

    // Exclude sensitive fields
    const { passwordHash, ...userData } = user;
    return userData;
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
    // Check if we're doing a create or update by checking if profile exists
    const existingProfile = await this.prisma.profile.findUnique({
      where: { userId },
    });

    if (existingProfile) {
      // UPDATE: only update provided fields
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
      return profile;
    } else {
      // CREATE: firstname and lastname are required
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
      return profile;
    }
  }

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId: string) {
    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    return sessions;
  }

  /**
   * Revoke a specific session
   */
  async revokeSession(userId: string, sessionId: string) {
    const session = await this.prisma.session.findFirst({
      where: {
        jwtId: sessionId,
        userId,
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: new Date() },
    });

    return { message: 'Session revoked successfully' };
  }

  /**
   * Revoke all sessions except the current one
   */
  async revokeAllOtherSessions(userId: string, currentSessionId?: string) {
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

    return { message: 'All other sessions revoked successfully' };
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

    return device;
  }

  /**
   * Get all user's devices
   */
  async getUserDevices(userId: string) {
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
  }

  /**
   * Update device push token
   */
  async updateDeviceToken(
    userId: string,
    deviceId: string,
    dto: { pushToken?: string },
  ) {
    // Verify ownership
    const device = await this.prisma.device.findUnique({
      where: { deviceId },
    });

    if (!device || device.userId !== userId) {
      throw new NotFoundException('Device not found');
    }

    // Update token and mark as active
    return this.prisma.device.update({
      where: { deviceId },
      data: {
        pushToken: dto.pushToken,
        lastSeenAt: new Date(),
        revokedAt: null, // Re-activate if previously revoked
      },
    });
  }

  /**
   * Revoke/delete a device
   */
  async revokeDevice(userId: string, deviceId: string) {
    // Verify ownership
    const device = await this.prisma.device.findUnique({
      where: { deviceId },
    });

    if (!device || device.userId !== userId) {
      throw new NotFoundException('Device not found');
    }

    // Soft delete
    await this.prisma.device.update({
      where: { deviceId },
      data: { revokedAt: new Date() },
    });

    return { message: 'Device revoked successfully' };
  }

  /**
   * Verify device exists and is not revoked
   */
  async verifyDevice(userId: string, deviceId: string) {
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
  }
}