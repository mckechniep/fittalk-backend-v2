import { Injectable, Logger, BadRequestException } from '@nestjs/common';
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
  }

  /**
   * Get current state snapshot from Redis
   */
  async getSnapshot(sessionId: string): Promise<SessionStateSnapshotDto | null> {
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
    } catch (error) {
      this.logger.error(`Failed to parse state for session ${sessionId}`, error);
      return null;
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
    const currentSnapshot = await this.getSnapshot(sessionId);

    if (!currentSnapshot) {
      throw new BadRequestException(`Session ${sessionId} not found or expired`);
    }

    // Validate state transition
    const allowedTransitions = STATE_TRANSITIONS[currentSnapshot.status];
    if (!allowedTransitions.includes(newState)) {
      throw new BadRequestException(
        `Invalid state transition: ${currentSnapshot.status} → ${newState}`,
      );
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
    const currentSnapshot = await this.getSnapshot(sessionId);

    if (!currentSnapshot || currentSnapshot.status !== 'exercising') {
      throw new BadRequestException('Cannot complete set: not currently exercising');
    }

    return this.transitionTo(sessionId, 'resting', {
      totalSetsCompleted: (currentSnapshot.totalSetsCompleted || 0) + 1,
      restTimerStartedAt: Date.now(),
      restDurationMs,
    });
  }

  /**
   * End rest period and return to exercising
   */
  async endRest(sessionId: string): Promise<SessionStateSnapshotDto> {
    const currentSnapshot = await this.getSnapshot(sessionId);

    if (!currentSnapshot || currentSnapshot.status !== 'resting') {
      throw new BadRequestException('Cannot end rest: not currently resting');
    }

    return this.transitionTo(sessionId, 'exercising', {
      currentSetNumber: (currentSnapshot.currentSetNumber || 0) + 1,
      restTimerStartedAt: null,
      restDurationMs: null,
    });
  }

  /**
   * Pause session
   */
  async pause(sessionId: string): Promise<SessionStateSnapshotDto> {
    const currentSnapshot = await this.getSnapshot(sessionId);

    if (!currentSnapshot) {
      throw new BadRequestException(`Session ${sessionId} not found`);
    }

    if (currentSnapshot.status === 'paused') {
      return currentSnapshot; // Already paused - idempotent
    }

    if (currentSnapshot.status === 'completed') {
      throw new BadRequestException('Cannot pause a completed session');
    }

    return this.transitionTo(sessionId, 'paused', {
      // Preserve rest timer if paused during rest
      metadata: {
        ...currentSnapshot.metadata,
        pausedFromState: currentSnapshot.status,
        pausedAt: Date.now(),
      },
    });
  }

  /**
   * Resume from pause
   */
  async resume(sessionId: string): Promise<SessionStateSnapshotDto> {
    const currentSnapshot = await this.getSnapshot(sessionId);

    if (!currentSnapshot || currentSnapshot.status !== 'paused') {
      throw new BadRequestException('Cannot resume: session not paused');
    }

    // Resume to the state we were in before pausing
    const previousState = currentSnapshot.metadata?.pausedFromState as SessionState;
    const resumeState = previousState && ['exercising', 'resting'].includes(previousState)
      ? previousState
      : 'exercising';

    return this.transitionTo(sessionId, resumeState, {
      metadata: {
        ...currentSnapshot.metadata,
        pausedFromState: undefined,
        pausedAt: undefined,
        resumedAt: Date.now(),
      },
    });
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
    const currentSnapshot = await this.getSnapshot(sessionId);

    if (!currentSnapshot) {
      throw new BadRequestException(`Session ${sessionId} not found`);
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
  }

  /**
   * Delete state from Redis (for cleanup or cancellation)
   */
  async deleteState(sessionId: string): Promise<void> {
    const key = this.getRedisKey(sessionId);
    await this.redis.del(key);
    this.logger.log(`Deleted state for session ${sessionId}`);
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
    const key = this.getRedisKey(sessionId);
    const data = JSON.stringify(snapshot);

    await this.redis.setEx(key, this.STATE_TTL_SECONDS, data);
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
    const key = this.getRedisKey(sessionId);
    await this.redis.expire(key, this.STATE_TTL_SECONDS);
  }
}
