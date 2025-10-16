// src/modules/auth/auth.service.ts
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
  async createOrUpdateProfile(userId: string, dto: CreateProfileDto | UpdateProfileDto) {
    // Check if we're doing a create or update by checking if profile exists
    const existingProfile = await this.prisma.profile.findUnique({
      where: { userId },
    });

    if (existingProfile) {
      // UPDATE: only update provided fields
      const profile = await this.prisma.profile.update({
        where: { userId },
        data: {
          ...(dto.firstname !== undefined && { firstname: dto.firstname }),
          ...(dto.lastname !== undefined && { lastname: dto.lastname }),
          ...(dto.sex !== undefined && { sex: dto.sex }),
          ...(dto.heightCm !== undefined && { heightCm: dto.heightCm }),
          ...(dto.weightKg !== undefined && { weightKg: dto.weightKg }),
          ...(dto.experienceLevel !== undefined && { experienceLevel: dto.experienceLevel }),
          ...(dto.healthNotes !== undefined && { healthNotes: dto.healthNotes }),
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
}