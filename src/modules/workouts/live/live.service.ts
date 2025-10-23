import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { SessionStateService } from './session-state.service';
import { REDIS_CLIENT } from '../../../common/redis/redis.module';
import type { RedisClientType } from 'redis';
import { plainToInstance } from 'class-transformer';
import {
  CreateLiveSessionDto,
  UpdateLiveSessionDto,
  LiveSessionResponseDto,
  LiveEventDto,
} from './dtos';

/**
 * Live Session Service
 *
 * Orchestrates live workout session management with database persistence.
 *
 * Responsibilities:
 * - Create and manage live workout sessions
 * - Coordinate SessionStateService for FSM operations
 * - Persist session data to PostgreSQL
 * - Track active sessions and WebSocket connections
 * - Handle session completion and logging
 * - Validate user permissions and ownership
 *
 * Design principles:
 * - Orchestration: Delegates state machine to SessionStateService
 * - Transactional: Uses Prisma transactions for atomicity
 * - Real-time: Coordinates with WebSocket gateway for broadcasting
 * - Distributed: Uses Redis for presence tracking
 * - Idempotent: Safe to call multiple times with same data
 *
 * Dependencies:
 * - PrismaService: Database access
 * - SessionStateService: Finite state machine
 * - Redis: Presence tracking, distributed state
 * - Logger: Structured logging
 */
@Injectable()
export class LiveSessionService {
  private readonly logger = new Logger(LiveSessionService.name);
  private readonly ACTIVE_SESSIONS_KEY = 'live:sessions:active';
  private readonly HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionState: SessionStateService,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClientType,
  ) {}

  /**
   * Create a new live workout session.
   *
   * Flow:
   * 1. Validate inputs (plan/day ownership if provided)
   * 2. Create LiveWorkoutSession record in database
   * 3. Initialize session state in Redis
   * 4. Add to active sessions set
   * 5. Return session response
   *
   * @param userId - Authenticated user ID
   * @param dto - Session creation data
   * @returns Created session with initial state
   */
  async createSession(
    userId: string,
    dto: CreateLiveSessionDto,
  ): Promise<LiveSessionResponseDto> {
    // Validate plan ownership if provided
    if (dto.workoutPlanId) {
      const plan = await this.prisma.workoutPlan.findFirst({
        where: { id: dto.workoutPlanId, userId },
      });

      if (!plan) {
        throw new NotFoundException('Workout plan not found or not owned by user');
      }
    }

    // Create session in database
    const session = await this.prisma.liveWorkoutSession.create({
      data: {
        userId,
        planId: dto.workoutPlanId || null,
        startedAt: dto.scheduledAt ? new Date(dto.scheduledAt) : new Date(),
        heartbeatAt: new Date(),
        stateJson: {
          title: dto.title,
          description: dto.description,
          private: dto.private || false,
        },
      },
    });

    // Initialize state machine in Redis
    await this.sessionState.initializeState(session.id);

    // Track as active session
    await this.redis.sAdd(this.ACTIVE_SESSIONS_KEY, session.id);

    this.logger.log(`Created live session ${session.id} for user ${userId}`);

    return this.toResponseDto(session);
  }

  /**
   * Get session by ID with permission check
   */
  async getSession(userId: string, sessionId: string): Promise<LiveSessionResponseDto> {
    const session = await this.prisma.liveWorkoutSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('You do not have access to this session');
    }

    return this.toResponseDto(session);
  }

  /**
   * Get all active sessions for a user
   */
  async getUserActiveSessions(userId: string): Promise<LiveSessionResponseDto[]> {
    const sessions = await this.prisma.liveWorkoutSession.findMany({
      where: {
        userId,
        endedAt: null, // Only active sessions
      },
      orderBy: { startedAt: 'desc' },
    });

    return sessions.map((session) => this.toResponseDto(session));
  }

  /**
   * Update session metadata (host only)
   */
  async updateSession(
    userId: string,
    sessionId: string,
    dto: UpdateLiveSessionDto,
  ): Promise<LiveSessionResponseDto> {
    const session = await this.prisma.liveWorkoutSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('Only the host can update this session');
    }

    if (session.endedAt) {
      throw new BadRequestException('Cannot update an ended session');
    }

    // Merge stateJson updates
    const updatedStateJson = {
      ...(session.stateJson as Record<string, any> || {}),
      ...(dto.title && { title: dto.title }),
      ...(dto.description && { description: dto.description }),
      ...(dto.private !== undefined && { private: dto.private }),
    };

    const updated = await this.prisma.liveWorkoutSession.update({
      where: { id: sessionId },
      data: {
        planId: dto.workoutPlanId || session.planId,
        stateJson: updatedStateJson,
        ...(dto.scheduledAt && { startedAt: new Date(dto.scheduledAt) }),
      },
    });

    this.logger.log(`Updated session ${sessionId}`);

    return this.toResponseDto(updated);
  }

  /**
   * Record heartbeat to track active sessions
   */
  async recordHeartbeat(userId: string, sessionId: string): Promise<void> {
    const session = await this.prisma.liveWorkoutSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    await this.prisma.liveWorkoutSession.update({
      where: { id: sessionId },
      data: { heartbeatAt: new Date() },
    });

    // Extend Redis state TTL
    await this.sessionState.extendTTL(sessionId);
  }

  /**
   * End a session and persist final state
   */
  async endSession(userId: string, sessionId: string): Promise<LiveSessionResponseDto> {
    const session = await this.prisma.liveWorkoutSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('Only the host can end this session');
    }

    if (session.endedAt) {
      // Already ended - idempotent
      return this.toResponseDto(session);
    }

    // Get final state snapshot from Redis
    const finalState = await this.sessionState.getSnapshot(sessionId);

    // Complete state machine
    if (finalState && finalState.status !== 'completed') {
      await this.sessionState.complete(sessionId);
    }

    // Update database
    const ended = await this.prisma.liveWorkoutSession.update({
      where: { id: sessionId },
      data: {
        endedAt: new Date(),
        stateJson: {
          ...(session.stateJson as Record<string, any> || {}),
          finalState,
        },
      },
    });

    // Remove from active sessions
    await this.redis.sRem(this.ACTIVE_SESSIONS_KEY, sessionId);

    this.logger.log(`Ended session ${sessionId}`);

    return this.toResponseDto(ended);
  }

  /**
   * Cancel a session (delete from DB and Redis)
   */
  async cancelSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.prisma.liveWorkoutSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('Only the host can cancel this session');
    }

    // Delete from database
    await this.prisma.liveWorkoutSession.delete({
      where: { id: sessionId },
    });

    // Delete from Redis
    await this.sessionState.deleteState(sessionId);
    await this.redis.sRem(this.ACTIVE_SESSIONS_KEY, sessionId);

    this.logger.log(`Cancelled session ${sessionId}`);
  }

  /**
   * Store a live event in the session's stateJson
   * (Alternative: could create a LiveSessionEvent table)
   */
  async recordEvent(
    userId: string,
    sessionId: string,
    event: LiveEventDto,
  ): Promise<void> {
    const session = await this.prisma.liveWorkoutSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    const stateJson = session.stateJson as Record<string, any> || {};
    const events = (stateJson.events as any[]) || [];

    events.push({
      ...event,
      timestamp: Date.now(),
      userId,
    });

    await this.prisma.liveWorkoutSession.update({
      where: { id: sessionId },
      data: {
        stateJson: {
          ...stateJson,
          events,
        },
      },
    });

    this.logger.debug(`Recorded event ${event.type} for session ${sessionId}`);
  }

  /**
   * Check if session is active (not ended and recent heartbeat)
   */
  async isSessionActive(sessionId: string): Promise<boolean> {
    const session = await this.prisma.liveWorkoutSession.findUnique({
      where: { id: sessionId },
      select: { endedAt: true, heartbeatAt: true },
    });

    if (!session || session.endedAt) {
      return false;
    }

    // Check if heartbeat is recent (within 2x interval)
    const heartbeatThreshold = Date.now() - this.HEARTBEAT_INTERVAL_MS * 2;
    const lastHeartbeat = session.heartbeatAt?.getTime() || 0;

    return lastHeartbeat > heartbeatThreshold;
  }

  /**
   * Get all active session IDs from Redis
   */
  async getActiveSessionIds(): Promise<string[]> {
    return this.redis.sMembers(this.ACTIVE_SESSIONS_KEY);
  }

  /**
   * Clean up stale sessions (no heartbeat for > 2 intervals)
   */
  async cleanupStaleSessions(): Promise<number> {
    const threshold = new Date(Date.now() - this.HEARTBEAT_INTERVAL_MS * 2);

    const staleSessions = await this.prisma.liveWorkoutSession.findMany({
      where: {
        endedAt: null,
        OR: [
          { heartbeatAt: { lt: threshold } },
          { heartbeatAt: null },
        ],
      },
      select: { id: true, userId: true },
    });

    for (const session of staleSessions) {
      await this.endSession(session.userId, session.id);
    }

    this.logger.log(`Cleaned up ${staleSessions.length} stale sessions`);

    return staleSessions.length;
  }

  /**
   * Convert Prisma model to response DTO
   */
  private toResponseDto(session: any): LiveSessionResponseDto {
    return plainToInstance(LiveSessionResponseDto, session, {
      excludeExtraneousValues: true,
    });
  }
}
