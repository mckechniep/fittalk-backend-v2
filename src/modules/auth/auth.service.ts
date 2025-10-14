import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AuthenticatedUser } from './strategies/jwt.strategy';

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
   */
  async createOrUpdateProfile(userId: string, dto: CreateProfileDto) {
    const profile = await this.prisma.profile.upsert({
      where: { userId },
      create: {
        userId,
        ...dto,
      },
      update: dto,
    });

    return profile;
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
  async revokeAllOtherSessions(userId: string, currentSessionId: string) {
    await this.prisma.session.updateMany({
      where: {
        userId,
        jwtId: { not: currentSessionId },
      },
      data: { expiresAt: new Date() },
    });

    return { message: 'All other sessions revoked successfully' };
  }

  /**
   * Register or update a device for push notifications
   */
  async registerDevice(userId: string, deviceData: {
    platform: string;
    deviceId: string;
    pushToken?: string;
  }) {
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
}