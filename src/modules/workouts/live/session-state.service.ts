// live-sessions/session-state.service.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import type { RedisClientType } from 'redis';
import { REDIS_CLIENT } from '../../../common/redis/redis.module';

/**
 * Session State Service
 * 
 * Manages ephemeral, real-time session state in Redis.
 * 
 * Responsibilities:
 * - Track active users in live workout sessions (presence)
 * - Maintain lightweight session state for real-time UI updates
 * - Handle user join/leave/heartbeat events
 * - Provide fast state snapshots without database queries
 * - Automatic cleanup of stale presence data
 * - Support for user metadata (display name, role, status)
 * 
 * Design principles:
 * - Ephemeral: Data lives only in Redis, not persisted to DB
 * - Fast: Sub-millisecond read/write operations
 * - TTL-based: Automatic cleanup via Redis expiration
 * - Eventually consistent: Real-time UX, not source of truth
 * - Graceful degradation: Falls back safely if Redis unavailable
 * - Memory efficient: Uses Redis hashes and sorted sets
 * 
 * Data structures:
 * - Hash: session:{sessionId}:users -> { userId: metadata }
 * - Sorted Set: session:{sessionId}:presence -> userId scored by timestamp
 * - String: session:{sessionId}:metadata -> JSON session info
 * 
 * Use cases:
 * - Show "3 people working out" in UI
 * - Display list of active participants
 * - Detect when users disconnect/timeout
 * - Sync real-time workout progress across devices
 * - Enable collaborative/social workout features
 * 
 * Dependencies:
 * - Redis: Primary data store for session state
 * - Logger: Structured logging
 */
@Injectable()
export class SessionStateService {
  private readonly logger = new Logger(SessionStateService.name);

  /**
   * TTL for session presence data (5 minutes).
   * After no activity, user removed from presence.
   */
  private readonly PRESENCE_TTL_SEC = 5 * 60;

  /**
   * TTL for session metadata (1 hour).
   * Session state expires after no activity.
   */
  private readonly SESSION_TTL_SEC = 60 * 60;

  /**
   * Heartbeat window for active presence (90 seconds).
   * Users without heartbeat in this window are considered inactive.
   */
  private readonly HEARTBEAT_WINDOW_SEC = 90;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClientType,
  ) {}

  /**
   * User joins a session.
   * 
   * Flow:
   * 1. Add user to session presence set with current timestamp
   * 2. Store user metadata in session hash
   * 3. Update session metadata (last activity time)
   * 4. Set TTL on all session keys
   * 
   * Idempotent: Safe to call multiple times for same user.
   * 
   * @param sessionId - Session ID (UUID)
   * @param userId - User ID joining the session
   * @param metadata - Optional user metadata (name, role, avatar)
   */
  async join(
    sessionId: string,
    userId: string,
    metadata?: {
      name?: string;
      role?: string;
      avatar?: string;
      status?: string;
    },
  ): Promise<void> {
    try {
      const now = Date.now();
      const presenceKey = this.getPresenceKey(sessionId);
      const usersKey = this.getUsersKey(sessionId);
      const metadataKey = this.getMetadataKey(sessionId);

      // Use pipeline for atomic multi-key operations
      const pipeline = this.redis.multi();

      // Add user to presence sorted set (score = timestamp)
      pipeline.zAdd(presenceKey, { score: now, value: userId });

      // Store user metadata
      const userMeta = JSON.stringify({
        userId,
        name: metadata?.name || 'Anonymous',
        role: metadata?.role || 'participant',
        avatar: metadata?.avatar,
        status: metadata?.status || 'active',
        joinedAt: now,
        lastSeenAt: now,
      });
      pipeline.hSet(usersKey, userId, userMeta);

      // Update session metadata
      pipeline.set(
        metadataKey,
        JSON.stringify({ lastActivityAt: now }),
        { EX: this.SESSION_TTL_SEC },
      );

      // Set TTLs on presence and users keys
      pipeline.expire(presenceKey, this.SESSION_TTL_SEC);
      pipeline.expire(usersKey, this.SESSION_TTL_SEC);

      await pipeline.exec();

      this.logger.debug(`User ${userId} joined session ${sessionId}`);
    } catch (error) {
      this.logger.error(
        `Failed to add user ${userId} to session ${sessionId}`,
        error,
      );
      // Non-critical, don't throw
    }
  }

  /**
   * User leaves a session.
   * 
   * Flow:
   * 1. Remove user from presence set
   * 2. Remove user metadata from hash
   * 3. If session is empty, clean up all keys
   * 
   * Idempotent: Safe to call even if user not in session.
   * 
   * @param sessionId - Session ID
   * @param userId - User ID leaving
   */
  async leave(sessionId: string, userId: string): Promise<void> {
    try {
      const presenceKey = this.getPresenceKey(sessionId);
      const usersKey = this.getUsersKey(sessionId);

      const pipeline = this.redis.multi();

      // Remove from presence
      pipeline.zRem(presenceKey, userId);

      // Remove user metadata
      pipeline.hDel(usersKey, userId);

      await pipeline.exec();

      // Check if session is now empty, clean up if so
      const remainingUsers = await this.redis.zCard(presenceKey);
      if (remainingUsers === 0) {
        await this.cleanupSession(sessionId);
      }

      this.logger.debug(`User ${userId} left session ${sessionId}`);
    } catch (error) {
      this.logger.error(
        `Failed to remove user ${userId} from session ${sessionId}`,
        error,
      );
      // Non-critical
    }
  }

  /**
   * Update user's last activity timestamp (heartbeat).
   * 
   * Clients should call this every 30-60 seconds to maintain presence.
   * If no heartbeat received within HEARTBEAT_WINDOW_SEC, user is stale.
   * 
   * @param sessionId - Session ID
   * @param userId - User ID
   * @param metadata - Optional metadata updates (status, etc.)
   */
  async upsertUser(
    sessionId: string,
    userId: string,
    metadata?: Partial<{
      status: string;
      currentExercise: string;
      currentSet: number;
    }>,
  ): Promise<void> {
    try {
      const now = Date.now();
      const presenceKey = this.getPresenceKey(sessionId);
      const usersKey = this.getUsersKey(sessionId);

      // Update presence timestamp
      await this.redis.zAdd(presenceKey, { score: now, value: userId });

      // Update user metadata if exists
      const existingMeta = await this.redis.hGet(usersKey, userId);
      if (existingMeta) {
        const parsed = JSON.parse(existingMeta);
        const updated = {
          ...parsed,
          lastSeenAt: now,
          ...(metadata && {
            status: metadata.status ?? parsed.status,
            currentExercise: metadata.currentExercise ?? parsed.currentExercise,
            currentSet: metadata.currentSet ?? parsed.currentSet,
          }),
        };
        await this.redis.hSet(usersKey, userId, JSON.stringify(updated));
      }

      // Refresh TTL
      await this.redis.expire(presenceKey, this.SESSION_TTL_SEC);
    } catch (error) {
      this.logger.error(
        `Failed to update user ${userId} in session ${sessionId}`,
        error,
      );
    }
  }

  /**
   * Get full session state snapshot.
   * 
   * Returns:
   * - Active users with metadata
   * - Session activity timestamps
   * - User count
   * - Stale users (no recent heartbeat)
   * 
   * Performance: O(n) where n = number of users in session
   * Typical: <1ms for sessions with <100 users
   * 
   * @param sessionId - Session ID
   * @returns Session state snapshot
   */
  async getSnapshot(sessionId: string): Promise<{
    sessionId: string;
    users: Array<{
      userId: string;
      name: string;
      role: string;
      avatar?: string;
      status: string;
      joinedAt: number;
      lastSeenAt: number;
      isStale: boolean;
    }>;
    userCount: number;
    activeCount: number;
    lastActivityAt: number | null;
  }> {
    try {
      const presenceKey = this.getPresenceKey(sessionId);
      const usersKey = this.getUsersKey(sessionId);
      const metadataKey = this.getMetadataKey(sessionId);

      // Fetch all data in parallel
      const [presenceData, usersData, sessionMeta] = await Promise.all([
        this.redis.zRangeWithScores(presenceKey, 0, -1),
        this.redis.hGetAll(usersKey),
        this.redis.get(metadataKey),
      ]);

      // Build presence map from sorted set
      const presenceMap = new Map<string, number>();
      for (const item of presenceData) {
        presenceMap.set(item.value, item.score);
      }

      // Parse user metadata and merge with presence
      const now = Date.now();
      const staleThreshold = now - this.HEARTBEAT_WINDOW_SEC * 1000;

      const users = Object.entries(usersData).map(([userId, metaStr]) => {
        const meta = JSON.parse(metaStr);
        const lastSeenAt = presenceMap.get(userId) || meta.lastSeenAt;
        const isStale = lastSeenAt < staleThreshold;

        return {
          userId,
          name: meta.name,
          role: meta.role,
          avatar: meta.avatar,
          status: meta.status,
          joinedAt: meta.joinedAt,
          lastSeenAt,
          isStale,
          currentExercise: meta.currentExercise,
          currentSet: meta.currentSet,
        };
      });

      // Sort by last seen (most recent first)
      users.sort((a, b) => b.lastSeenAt - a.lastSeenAt);

      const activeCount = users.filter((u) => !u.isStale).length;
      const lastActivityAt = sessionMeta
        ? JSON.parse(sessionMeta).lastActivityAt
        : null;

      return {
        sessionId,
        users,
        userCount: users.length,
        activeCount,
        lastActivityAt,
      };
    } catch (error) {
      this.logger.error(`Failed to get snapshot for session ${sessionId}`, error);
      
      // Graceful fallback
      return {
        sessionId,
        users: [],
        userCount: 0,
        activeCount: 0,
        lastActivityAt: null,
      };
    }
  }

  /**
   * Get active user count for a session.
   * 
   * Faster than getSnapshot() when only count needed.
   * 
   * @param sessionId - Session ID
   * @returns Number of users with recent heartbeat
   */
  async getActiveUserCount(sessionId: string): Promise<number> {
    try {
      const presenceKey = this.getPresenceKey(sessionId);
      const now = Date.now();
      const staleThreshold = now - this.HEARTBEAT_WINDOW_SEC * 1000;

      // Count users with score (timestamp) > staleThreshold
      const activeCount = await this.redis.zCount(
        presenceKey,
        staleThreshold,
        '+inf',
      );

      return activeCount;
    } catch (error) {
      this.logger.error(
        `Failed to get active user count for session ${sessionId}`,
        error,
      );
      return 0;
    }
  }

  /**
   * Check if user is in a session.
   * 
   * @param sessionId - Session ID
   * @param userId - User ID
   * @returns true if user is in session
   */
  async isUserInSession(sessionId: string, userId: string): Promise<boolean> {
    try {
      const presenceKey = this.getPresenceKey(sessionId);
      const score = await this.redis.zScore(presenceKey, userId);
      return score !== null;
    } catch (error) {
      this.logger.error(
        `Failed to check user ${userId} in session ${sessionId}`,
        error,
      );
      return false;
    }
  }

  /**
   * Remove stale users from all session keys.
   * 
   * Should be called periodically (e.g., every 5 minutes) via cron.
   * Removes users who haven't sent heartbeat in HEARTBEAT_WINDOW_SEC.
   * 
   * @param sessionId - Session ID to clean
   */
  async removeStaleUsers(sessionId: string): Promise<void> {
    try {
      const presenceKey = this.getPresenceKey(sessionId);
      const usersKey = this.getUsersKey(sessionId);
      const now = Date.now();
      const staleThreshold = now - this.HEARTBEAT_WINDOW_SEC * 1000;

      // Find stale users
      const staleUsers = await this.redis.zRangeByScore(
        presenceKey,
        0,
        staleThreshold,
      );

      if (staleUsers.length === 0) {
        return;
      }

      // Remove stale users
      const pipeline = this.redis.multi();
      for (const userId of staleUsers) {
        pipeline.zRem(presenceKey, userId);
        pipeline.hDel(usersKey, userId);
      }
      await pipeline.exec();

      this.logger.debug(
        `Removed ${staleUsers.length} stale users from session ${sessionId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to remove stale users from session ${sessionId}`,
        error,
      );
    }
  }

  /**
   * Clean up all session keys.
   * 
   * Called when session ends or becomes empty.
   * 
   * @param sessionId - Session ID to clean up
   */
  async cleanupSession(sessionId: string): Promise<void> {
    try {
      const keys = [
        this.getPresenceKey(sessionId),
        this.getUsersKey(sessionId),
        this.getMetadataKey(sessionId),
      ];

      await this.redis.del(keys);

      this.logger.debug(`Cleaned up session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to cleanup session ${sessionId}`, error);
    }
  }

  /**
   * Update session-level metadata.
   * 
   * Use for ephemeral session state like:
   * - Current exercise being performed
   * - Workout phase (warmup, main, cooldown)
   * - Playlist/music info
   * - Timer/countdown values
   * 
   * @param sessionId - Session ID
   * @param metadata - Metadata to store
   */
  async updateSessionMetadata(
    sessionId: string,
    metadata: Record<string, any>,
  ): Promise<void> {
    try {
      const metadataKey = this.getMetadataKey(sessionId);
      const existing = await this.redis.get(metadataKey);
      const parsed = existing ? JSON.parse(existing) : {};

      const updated = {
        ...parsed,
        ...metadata,
        lastActivityAt: Date.now(),
      };

      await this.redis.set(
        metadataKey,
        JSON.stringify(updated),
        { EX: this.SESSION_TTL_SEC },
      );
    } catch (error) {
      this.logger.error(
        `Failed to update metadata for session ${sessionId}`,
        error,
      );
    }
  }

  /**
   * Broadcast a message to all users in a session.
   * 
   * Note: This method only stores the message in Redis.
   * The WebSocket gateway should poll or subscribe to deliver it.
   * 
   * For real-time delivery, use EventEmitter2 or WebSocket gateway directly.
   * 
   * @param sessionId - Session ID
   * @param message - Message payload
   */
  async broadcastMessage(
    sessionId: string,
    message: {
      type: string;
      payload: any;
      fromUserId?: string;
    },
  ): Promise<void> {
    try {
      const messagesKey = `session:${sessionId}:messages`;
      const messageData = JSON.stringify({
        ...message,
        timestamp: Date.now(),
      });

      // Use list (RPUSH) to maintain message order
      await this.redis.rPush(messagesKey, messageData);

      // Keep only last 100 messages
      await this.redis.lTrim(messagesKey, -100, -1);

      // Set TTL
      await this.redis.expire(messagesKey, this.SESSION_TTL_SEC);
    } catch (error) {
      this.logger.error(
        `Failed to broadcast message to session ${sessionId}`,
        error,
      );
    }
  }

  // ==================== PRIVATE HELPER METHODS ====================

  /**
   * Get Redis key for session presence sorted set.
   * 
   * @param sessionId - Session ID
   * @returns Redis key
   */
  private getPresenceKey(sessionId: string): string {
    return `session:${sessionId}:presence`;
  }

  /**
   * Get Redis key for session users hash.
   * 
   * @param sessionId - Session ID
   * @returns Redis key
   */
  private getUsersKey(sessionId: string): string {
    return `session:${sessionId}:users`;
  }

  /**
   * Get Redis key for session metadata string.
   * 
   * @param sessionId - Session ID
   * @returns Redis key
   */
  private getMetadataKey(sessionId: string): string {
    return `session:${sessionId}:metadata`;
  }
}