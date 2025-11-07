import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { REDIS_CLIENT } from '../../../common/redis/redis.module';
import type { RedisClientType } from 'redis';
import { SessionStateSnapshotDto } from './dtos/session-state-snapshot.dto';

/**
 * Session states for the finite state machine
 */
export type SessionState = 'idle' | 'exercising' | 'resting' | 'paused' | 'completed';

/**
 * Valid state transitions for the FSM
 */
const STATE_TRANSITIONS: Record<SessionState, SessionState[]> = {
  idle: ['exercising', 'completed'],
  exercising: ['resting', 'paused', 'completed'],
  resting: ['exercising', 'paused', 'completed'],
  paused: ['exercising', 'resting', 'completed'],
  completed: [], // Terminal state - no transitions allowed
};

/**
 * Session State Service
 *
 * Manages the finite state machine for live workout sessions.
 * Handles state transitions, validation, and persistence in Redis.
 *
 * Design:
 * - States: idle → exercising ↔ resting ↔ paused → completed
 * - Redis as source of truth for real-time state
 * - Fast reads/writes for WebSocket synchronization
 * - TTL-based cleanup (4 hours after session ends)
 */
@Injectable()
export class SessionStateService {
  private readonly logger = new Logger(SessionStateService.name);
  private readonly STATE_KEY_PREFIX = 'session:state:';
  private readonly STATE_TTL_SECONDS = 4 * 60 * 60; // 4 hours

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClientType,
  ) {}

  /**
   * Initialize a new session state in Redis
   */
  async initializeState(sessionId: string, initialExerciseId?: string): Promise<SessionStateSnapshotDto> {
    try {
      const snapshot: SessionStateSnapshotDto = {
        sessionId,
        status: 'idle',
        currentExerciseId: initialExerciseId || null,
        currentExerciseIndex: initialExerciseId ? 0 : undefined,
        currentSetNumber: 0,
        totalSetsCompleted: 0,
        restTimerStartedAt: null,
        restDurationMs: null,
        lastActivityAt: new Date(),
        metadata: {},
      };

      await this.persistState(sessionId, snapshot);
      this.logger.log(`Initialized state for session ${sessionId}`);

      return snapshot;
    } catch (error) {
      this.logger.error(`Failed to initialize state for session ${sessionId}`, error);
      throw new InternalServerErrorException({
        message: 'Failed to initialize session state',
        error: 'RedisError',
      });
    }
  }

  /**
   * Get current state snapshot from Redis
   */
  async getSnapshot(sessionId: string): Promise<SessionStateSnapshotDto | null> {
    try {
      const key = this.getRedisKey(sessionId);
      const data = await this.redis.get(key);

      if (!data) {
        this.logger.warn(`No state found for session ${sessionId}`);
        return null;
      }

      try {
        const parsed = JSON.parse(data);
        // Convert lastActivityAt back to Date
        parsed.lastActivityAt = new Date(parsed.lastActivityAt);
        return parsed as SessionStateSnapshotDto;
      } catch (parseError) {
        this.logger.error(`Failed to parse state for session ${sessionId}`, parseError);
        return null;
      }
    } catch (error) {
      this.logger.error(`Redis error getting snapshot for session ${sessionId}`, error);
      throw new InternalServerErrorException({
        message: 'Failed to retrieve session state',
        error: 'RedisError',
      });
    }
  }

  /**
   * Transition to a new state with validation
   */
  async transitionTo(
    sessionId: string,
    newState: SessionState,
    updates?: Partial<SessionStateSnapshotDto>,
  ): Promise<SessionStateSnapshotDto> {
    try {
      const currentSnapshot = await this.getSnapshot(sessionId);

      if (!currentSnapshot) {
        throw new BadRequestException({
          message: `Session ${sessionId} not found or expired`,
          error: 'SessionNotFound',
        });
      }

      // Validate state transition
      const allowedTransitions = STATE_TRANSITIONS[currentSnapshot.status];
      if (!allowedTransitions.includes(newState)) {
        throw new BadRequestException({
          message: `Invalid state transition: ${currentSnapshot.status} → ${newState}`,
          error: 'InvalidStateTransition',
        });
      }

      // Apply transition
      const updatedSnapshot: SessionStateSnapshotDto = {
        ...currentSnapshot,
        ...updates,
        status: newState,
        lastActivityAt: new Date(),
      };

      await this.persistState(sessionId, updatedSnapshot);
      this.logger.log(`Session ${sessionId} transitioned: ${currentSnapshot.status} → ${newState}`);

      return updatedSnapshot;
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
        throw error;
      }
      this.logger.error(`Error transitioning session ${sessionId} to ${newState}`, error);
      throw new InternalServerErrorException({
        message: 'Failed to transition session state',
        error: 'StateTransitionError',
      });
    }
  }

  /**
   * Start exercising
   */
  async startExercise(
    sessionId: string,
    exerciseId: string,
    exerciseIndex: number,
  ): Promise<SessionStateSnapshotDto> {
    return this.transitionTo(sessionId, 'exercising', {
      currentExerciseId: exerciseId,
      currentExerciseIndex: exerciseIndex,
      currentSetNumber: 1,
      restTimerStartedAt: null,
      restDurationMs: null,
    });
  }

  /**
   * Complete a set and transition to resting
   */
  async completeSet(
    sessionId: string,
    restDurationMs: number,
  ): Promise<SessionStateSnapshotDto> {
    try {
      const currentSnapshot = await this.getSnapshot(sessionId);

      if (!currentSnapshot || currentSnapshot.status !== 'exercising') {
        throw new BadRequestException({
          message: 'Cannot complete set: not currently exercising',
          error: 'InvalidSessionState',
        });
      }

      return await this.transitionTo(sessionId, 'resting', {
        totalSetsCompleted: (currentSnapshot.totalSetsCompleted || 0) + 1,
        restTimerStartedAt: Date.now(),
        restDurationMs,
      });
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
        throw error;
      }
      this.logger.error(`Error completing set for session ${sessionId}`, error);
      throw new InternalServerErrorException({
        message: 'Failed to complete set',
        error: 'StateUpdateError',
      });
    }
  }

  /**
   * End rest period and return to exercising
   */
  async endRest(sessionId: string): Promise<SessionStateSnapshotDto> {
    try {
      const currentSnapshot = await this.getSnapshot(sessionId);

      if (!currentSnapshot || currentSnapshot.status !== 'resting') {
        throw new BadRequestException({
          message: 'Cannot end rest: not currently resting',
          error: 'InvalidSessionState',
        });
      }

      return await this.transitionTo(sessionId, 'exercising', {
        currentSetNumber: (currentSnapshot.currentSetNumber || 0) + 1,
        restTimerStartedAt: null,
        restDurationMs: null,
      });
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
        throw error;
      }
      this.logger.error(`Error ending rest for session ${sessionId}`, error);
      throw new InternalServerErrorException({
        message: 'Failed to end rest',
        error: 'StateUpdateError',
      });
    }
  }

  /**
   * Pause session
   */
  async pause(sessionId: string): Promise<SessionStateSnapshotDto> {
    try {
      const currentSnapshot = await this.getSnapshot(sessionId);

      if (!currentSnapshot) {
        throw new BadRequestException({
          message: `Session ${sessionId} not found`,
          error: 'SessionNotFound',
        });
      }

      if (currentSnapshot.status === 'paused') {
        return currentSnapshot; // Already paused - idempotent
      }

      if (currentSnapshot.status === 'completed') {
        throw new BadRequestException({
          message: 'Cannot pause a completed session',
          error: 'InvalidSessionState',
        });
      }

      return await this.transitionTo(sessionId, 'paused', {
        // Preserve rest timer if paused during rest
        metadata: {
          ...currentSnapshot.metadata,
          pausedFromState: currentSnapshot.status,
          pausedAt: Date.now(),
        },
      });
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
        throw error;
      }
      this.logger.error(`Error pausing session ${sessionId}`, error);
      throw new InternalServerErrorException({
        message: 'Failed to pause session',
        error: 'StateUpdateError',
      });
    }
  }

  /**
   * Resume from pause
   */
  async resume(sessionId: string): Promise<SessionStateSnapshotDto> {
    try {
      const currentSnapshot = await this.getSnapshot(sessionId);

      if (!currentSnapshot || currentSnapshot.status !== 'paused') {
        throw new BadRequestException({
          message: 'Cannot resume: session not paused',
          error: 'InvalidSessionState',
        });
      }

      // Resume to the state we were in before pausing
      const previousState = currentSnapshot.metadata?.pausedFromState as SessionState;
      const resumeState = previousState && ['exercising', 'resting'].includes(previousState)
        ? previousState
        : 'exercising';

      return await this.transitionTo(sessionId, resumeState, {
        metadata: {
          ...currentSnapshot.metadata,
          pausedFromState: undefined,
          pausedAt: undefined,
          resumedAt: Date.now(),
        },
      });
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
        throw error;
      }
      this.logger.error(`Error resuming session ${sessionId}`, error);
      throw new InternalServerErrorException({
        message: 'Failed to resume session',
        error: 'StateUpdateError',
      });
    }
  }

  /**
   * Complete session (terminal state)
   */
  async complete(sessionId: string): Promise<SessionStateSnapshotDto> {
    return this.transitionTo(sessionId, 'completed', {
      currentExerciseId: null,
      restTimerStartedAt: null,
      restDurationMs: null,
    });
  }

  /**
   * Update arbitrary metadata
   */
  async updateMetadata(
    sessionId: string,
    metadata: Record<string, any>,
  ): Promise<SessionStateSnapshotDto> {
    try {
      const currentSnapshot = await this.getSnapshot(sessionId);

      if (!currentSnapshot) {
        throw new BadRequestException({
          message: `Session ${sessionId} not found`,
          error: 'SessionNotFound',
        });
      }

      const updatedSnapshot: SessionStateSnapshotDto = {
        ...currentSnapshot,
        metadata: {
          ...currentSnapshot.metadata,
          ...metadata,
        },
        lastActivityAt: new Date(),
      };

      await this.persistState(sessionId, updatedSnapshot);
      return updatedSnapshot;
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
        throw error;
      }
      this.logger.error(`Error updating metadata for session ${sessionId}`, error);
      throw new InternalServerErrorException({
        message: 'Failed to update session metadata',
        error: 'StateUpdateError',
      });
    }
  }

  /**
   * Delete state from Redis (for cleanup or cancellation)
   */
  async deleteState(sessionId: string): Promise<void> {
    try {
      const key = this.getRedisKey(sessionId);
      await this.redis.del(key);
      this.logger.log(`Deleted state for session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Redis error deleting state for session ${sessionId}`, error);
      throw new InternalServerErrorException({
        message: 'Failed to delete session state',
        error: 'RedisError',
      });
    }
  }

  /**
   * Check if a state transition is valid
   */
  isTransitionValid(currentState: SessionState, nextState: SessionState): boolean {
    const allowedTransitions = STATE_TRANSITIONS[currentState];
    return allowedTransitions.includes(nextState);
  }

  /**
   * Persist state to Redis with TTL
   */
  private async persistState(sessionId: string, snapshot: SessionStateSnapshotDto): Promise<void> {
    try {
      const key = this.getRedisKey(sessionId);
      const data = JSON.stringify(snapshot);

      await this.redis.setEx(key, this.STATE_TTL_SECONDS, data);
    } catch (error) {
      this.logger.error(`Redis error persisting state for session ${sessionId}`, error);
      throw new InternalServerErrorException({
        message: 'Failed to persist session state',
        error: 'RedisError',
      });
    }
  }

  /**
   * Generate Redis key for session state
   */
  private getRedisKey(sessionId: string): string {
    return `${this.STATE_KEY_PREFIX}${sessionId}`;
  }

  /**
   * Extend TTL for active sessions (call on heartbeat)
   */
  async extendTTL(sessionId: string): Promise<void> {
    try {
      const key = this.getRedisKey(sessionId);
      await this.redis.expire(key, this.STATE_TTL_SECONDS);
    } catch (error) {
      this.logger.error(`Redis error extending TTL for session ${sessionId}`, error);
      throw new InternalServerErrorException({
        message: 'Failed to extend session TTL',
        error: 'RedisError',
      });
    }
  }
}
