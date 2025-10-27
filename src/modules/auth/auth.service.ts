import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get current user with profile
   */
  async getCurrentUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        preferences: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Create or update user profile
   */
  async createOrUpdateProfile(
    userId: string,
    profileData: {
      firstname?: string;
      lastname?: string;
      sex?: string;
      heightCm?: number;
      weightKg?: number;
      experienceLevel?: string;
      healthNotes?: string;
      goalType?: string;
    },
  ) {
    const profile = await this.prisma.profile.upsert({
      where: { userId },
      create: {
        userId,
        firstname: profileData.firstname || '',
        lastname: profileData.lastname || '',
        sex: profileData.sex as any,
        heightCm: profileData.heightCm,
        weightKg: profileData.weightKg,
        experienceLevel: profileData.experienceLevel as any,
        healthNotes: profileData.healthNotes,
        goalType: profileData.goalType as any,
      },
      update: {
        ...profileData,
        sex: profileData.sex as any,
        experienceLevel: profileData.experienceLevel as any,
        goalType: profileData.goalType as any,
      },
    });

    return profile;
  }

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId: string) {
    const now = new Date();
    return this.prisma.session.findMany({
      where: {
        userId,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        jwtId: true,
        userAgent: true,
        ip: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  /**
   * Revoke a specific session
   */
  async revokeSession(userId: string, sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.userId !== userId) {
      throw new NotFoundException('Session not found');
    }

    await this.prisma.session.update({
      where: { id: sessionId },
      data: { expiresAt: new Date() },
    });

    return { message: 'Session revoked successfully' };
  }

  /**
   * Revoke all other sessions except the current one
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
   * 
   * Flow:
   * 1. Upsert device by deviceId (unique identifier)
   * 2. If exists: update push token and lastSeenAt, clear revokedAt
   * 3. If new: create device record
   * 
   * Design decision: Upsert ensures idempotency
   * - Mobile app can call this on every app launch
   * - Same deviceId will update, not duplicate
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
   * 
   * Returns both active and revoked devices for audit purposes
   * Frontend can filter by revokedAt if needed
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
   * 
   * Flow:
   * 1. Verify device belongs to user
   * 2. Update push token and lastSeenAt
   * 3. Clear revokedAt if device was previously revoked
   * 
   * Use case: 
   * - FCM/APNS token refresh
   * - User re-installs app on same device
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
   * 
   * Flow:
   * 1. Verify device belongs to user
   * 2. Soft delete by setting revokedAt timestamp
   * 
   * Design decision: Soft delete (keep record) vs hard delete
   * - We use soft delete to maintain audit trail
   * - Push notifications can check revokedAt before sending
   * - User can re-register same device later
   * - Compliance: retain device registration history
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
   * 
   * Use case:
   * - Before sending push notification
   * - Health check for device registration
   * - Mobile app can verify on startup
   * 
   * Returns:
   * - { valid: true, device: {...} } if device exists and is active
   * - { valid: false, reason: '...' } if device is missing or revoked
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
