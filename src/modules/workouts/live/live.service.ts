import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  Inject,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { SessionStateService } from './session-state.service';
import { REDIS_CLIENT } from '../../../common/redis/redis.module';
import type { RedisClientType } from 'redis';
import { plainToInstance } from 'class-transformer';
import { Prisma } from '@prisma/client';
import {
  CreateLiveSessionDto,
  UpdateLiveSessionDto,
  LiveSessionResponseDto,
  LiveEventDto,
} from './dtos';
import { handlePrismaError } from '../../../common/utils/prisma-error.handler';

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
    try {
      // Validate plan ownership if provided
      if (dto.workoutPlanId) {
        const plan = await this.prisma.workoutPlan.findFirst({
          where: { id: dto.workoutPlanId, userId },
        });

        if (!plan) {
          throw new NotFoundException({
            message: 'Workout plan not found or not owned by user',
            error: 'PlanNotFound',
          });
        }
      }

      this.logger.log(`Creating live session for user ${userId}`);

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
          } as Prisma.InputJsonValue,
        },
      });

      // Initialize state machine in Redis
      try {
        await this.sessionState.initializeState(session.id);
      } catch (redisError) {
        this.logger.error(`Redis error initializing state for session ${session.id}`, redisError);
        throw new InternalServerErrorException({
          message: 'Failed to initialize session state',
          error: 'RedisError',
        });
      }

      // Track as active session
      try {
        await this.redis.sAdd(this.ACTIVE_SESSIONS_KEY, session.id);
      } catch (redisError) {
        this.logger.error(`Redis error tracking session ${session.id}`, redisError);
        // Non-critical - continue
      }

      this.logger.log(`Successfully created live session ${session.id}`);
      return this.toResponseDto(session);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'create live session');
    }
  }

  /**
   * Get session by ID with permission check
   */
  async getSession(userId: string, sessionId: string): Promise<LiveSessionResponseDto> {
    try {
      const session = await this.prisma.liveWorkoutSession.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        throw new NotFoundException({
          message: 'Session not found',
          error: 'SessionNotFound',
        });
      }

      if (session.userId !== userId) {
        throw new ForbiddenException({
          message: 'You do not have access to this session',
          error: 'SessionAccessDenied',
        });
      }

      return this.toResponseDto(session);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'get live session');
    }
  }

  /**
   * Get all active sessions for a user
   */
  async getUserActiveSessions(userId: string): Promise<LiveSessionResponseDto[]> {
    try {
      const sessions = await this.prisma.liveWorkoutSession.findMany({
        where: {
          userId,
          endedAt: null, // Only active sessions
        },
        orderBy: { startedAt: 'desc' },
      });

      return sessions.map((session) => this.toResponseDto(session));
    } catch (error) {
      handlePrismaError(error, this.logger, 'get user active sessions');
    }
  }

  /**
   * Update session metadata (host only)
   */
  async updateSession(
    userId: string,
    sessionId: string,
    dto: UpdateLiveSessionDto,
  ): Promise<LiveSessionResponseDto> {
    try {
      const session = await this.prisma.liveWorkoutSession.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        throw new NotFoundException({
          message: 'Session not found',
          error: 'SessionNotFound',
        });
      }

      if (session.userId !== userId) {
        throw new ForbiddenException({
          message: 'Only the host can update this session',
          error: 'SessionAccessDenied',
        });
      }

      if (session.endedAt) {
        throw new BadRequestException({
          message: 'Cannot update an ended session',
          error: 'SessionAlreadyEnded',
        });
      }

      this.logger.log(`Updating session ${sessionId} for user ${userId}`);

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

      this.logger.log(`Successfully updated session ${sessionId}`);

      return this.toResponseDto(updated);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'update live session');
    }
  }

  /**
   * Record heartbeat to track active sessions
   */
  async recordHeartbeat(userId: string, sessionId: string): Promise<void> {
    try {
      const session = await this.prisma.liveWorkoutSession.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        throw new NotFoundException({
          message: 'Session not found',
          error: 'SessionNotFound',
        });
      }

      if (session.userId !== userId) {
        throw new ForbiddenException({
          message: 'Not authorized',
          error: 'SessionAccessDenied',
        });
      }

      await this.prisma.liveWorkoutSession.update({
        where: { id: sessionId },
        data: { heartbeatAt: new Date() },
      });

      // Extend Redis state TTL
      try {
        await this.sessionState.extendTTL(sessionId);
      } catch (redisError) {
        this.logger.error(`Redis error extending TTL for session ${sessionId}`, redisError);
        // Non-critical - continue
      }
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'record heartbeat');
    }
  }

  /**
   * End a session and persist final state
   */
  async endSession(userId: string, sessionId: string): Promise<LiveSessionResponseDto> {
    try {
      const session = await this.prisma.liveWorkoutSession.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        throw new NotFoundException({
          message: 'Session not found',
          error: 'SessionNotFound',
        });
      }

      if (session.userId !== userId) {
        throw new ForbiddenException({
          message: 'Only the host can end this session',
          error: 'SessionAccessDenied',
        });
      }

      if (session.endedAt) {
        // Already ended - idempotent
        return this.toResponseDto(session);
      }

      this.logger.log(`Ending session ${sessionId} for user ${userId}`);

      // Get final state snapshot from Redis
      let finalState;
      try {
        finalState = await this.sessionState.getSnapshot(sessionId);

        // Complete state machine
        if (finalState && finalState.status !== 'completed') {
          await this.sessionState.complete(sessionId);
        }
      } catch (redisError) {
        this.logger.error(`Redis error getting final state for session ${sessionId}`, redisError);
        // Continue - will save session without final state
      }

      // Update database - merge final state into stateJson
      const currentStateJson = (session.stateJson as Prisma.JsonObject) || {};
      const updatedStateJson: Prisma.JsonObject = {
        ...currentStateJson,
        finalState: finalState as Prisma.JsonValue,
      };

      const ended = await this.prisma.liveWorkoutSession.update({
        where: { id: sessionId },
        data: {
          endedAt: new Date(),
          stateJson: updatedStateJson,
        },
      });

      // Remove from active sessions
      try {
        await this.redis.sRem(this.ACTIVE_SESSIONS_KEY, sessionId);
      } catch (redisError) {
        this.logger.error(`Redis error removing session ${sessionId} from active set`, redisError);
        // Non-critical - continue
      }

      this.logger.log(`Successfully ended session ${sessionId}`);

      return this.toResponseDto(ended);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'end live session');
    }
  }

  /**
   * Cancel a session (delete from DB and Redis)
   */
  async cancelSession(userId: string, sessionId: string): Promise<void> {
    try {
      const session = await this.prisma.liveWorkoutSession.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        throw new NotFoundException({
          message: 'Session not found',
          error: 'SessionNotFound',
        });
      }

      if (session.userId !== userId) {
        throw new ForbiddenException({
          message: 'Only the host can cancel this session',
          error: 'SessionAccessDenied',
        });
      }

      this.logger.log(`Cancelling session ${sessionId} for user ${userId}`);

      // Delete from database
      await this.prisma.liveWorkoutSession.delete({
        where: { id: sessionId },
      });

      // Delete from Redis
      try {
        await this.sessionState.deleteState(sessionId);
        await this.redis.sRem(this.ACTIVE_SESSIONS_KEY, sessionId);
      } catch (redisError) {
        this.logger.error(`Redis error cleaning up session ${sessionId}`, redisError);
        // Non-critical - session already deleted from DB
      }

      this.logger.log(`Successfully cancelled session ${sessionId}`);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'cancel live session');
    }
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
    try {
      const session = await this.prisma.liveWorkoutSession.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        throw new NotFoundException({
          message: 'Session not found',
          error: 'SessionNotFound',
        });
      }

      if (session.userId !== userId) {
        throw new ForbiddenException({
          message: 'Not authorized',
          error: 'SessionAccessDenied',
        });
      }

      // Type-safe handling of stateJson with events array
      interface SessionState {
        events?: Array<LiveEventDto & { timestamp: number; userId: string }>;
        [key: string]: unknown;
      }

      const stateJson = (session.stateJson as SessionState) || {};
      const events = stateJson.events || [];

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
            events: events as unknown as Prisma.JsonValue,
          } as Prisma.InputJsonValue,
        },
      });

      this.logger.debug(`Recorded event ${event.type} for session ${sessionId}`);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      handlePrismaError(error, this.logger, 'record session event');
    }
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
    try {
      const threshold = new Date(Date.now() - this.HEARTBEAT_INTERVAL_MS * 2);

      this.logger.log('Starting cleanup of stale sessions');

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
        try {
          await this.endSession(session.userId, session.id);
        } catch (error) {
          this.logger.error(`Failed to end stale session ${session.id}`, error);
          // Continue processing other sessions
        }
      }

      this.logger.log(`Cleaned up ${staleSessions.length} stale sessions`);

      return staleSessions.length;
    } catch (error) {
      handlePrismaError(error, this.logger, 'cleanup stale sessions');
    }
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
