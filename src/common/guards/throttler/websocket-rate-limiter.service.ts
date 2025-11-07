import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RedisClientType } from 'redis';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { RATE_LIMITS } from './throttler.config';

/**
 * WebSocket Rate Limiter Service
 *
 * Provides rate limiting for WebSocket events using Redis.
 * Unlike HTTP endpoints, WebSocket events cannot use decorators,
 * so this service provides programmatic rate limiting.
 *
 * Usage:
 * ```typescript
 * const allowed = await this.wsRateLimiter.checkLimit(
 *   userId,
 *   'join-session',
 *   RATE_LIMITS.LIVE_SESSION_JOIN
 * );
 *
 * if (!allowed) {
 *   return createWsError('join-session', 'RATE_LIMIT', 'Too many requests');
 * }
 * ```
 *
 * Features:
 * - Redis-backed distributed rate limiting
 * - Per-user tracking (not IP-based for WebSocket)
 * - Sliding window algorithm
 * - Automatic cleanup of expired keys
 * - Detailed logging for violations
 */
@Injectable()
export class WebSocketRateLimiterService {
  private readonly logger = new Logger(WebSocketRateLimiterService.name);
  private readonly environment: 'development' | 'production' | 'test';
  private readonly appNamespace: string;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClientType,
    private readonly configService: ConfigService,
  ) {
    this.environment = this.configService.get<string>('NODE_ENV') as any || 'development';
    this.appNamespace = this.configService.get<string>('APP_NAME', 'fittalk');
  }

  /**
   * Check if user is within rate limit for a specific event
   *
   * @param userId - User ID making the request
   * @param eventName - WebSocket event name (e.g., 'join-session')
   * @param config - Rate limit configuration { ttl: ms, limit: count }
   * @returns true if allowed, false if rate limit exceeded
   */
  async checkLimit(
    userId: string,
    eventName: string,
    config: { ttl: number; limit: number },
  ): Promise<boolean> {
    try {
      // Apply environment adjustments
      const adjustedLimit = this.getEnvironmentAdjustedLimit(config.limit);

      const key = this.getRedisKey(userId, eventName);
      const now = Date.now();
      const windowStart = now - config.ttl;

      // Use Redis sorted set with timestamps as scores
      // Remove old entries outside the time window
      await this.redis.zRemRangeByScore(key, 0, windowStart);

      // Count requests in current window
      const count = await this.redis.zCard(key);

      if (count >= adjustedLimit) {
        // Rate limit exceeded
        this.logViolation(userId, eventName, count, adjustedLimit, config.ttl);
        return false;
      }

      // Add current request to the window
      await this.redis.zAdd(key, {
        score: now,
        value: `${now}-${Math.random()}`, // Unique value to prevent collisions
      });

      // Set expiration on the key (cleanup)
      await this.redis.expire(key, Math.ceil(config.ttl / 1000));

      return true;
    } catch (error) {
      this.logger.error(`Rate limit check error: ${error.message}`);
      // Fail open (allow request) on Redis errors to prevent blocking users
      return true;
    }
  }

  /**
   * Get remaining requests for a user on a specific event
   *
   * @param userId - User ID
   * @param eventName - WebSocket event name
   * @param config - Rate limit configuration
   * @returns Number of remaining requests in current window
   */
  async getRemainingRequests(
    userId: string,
    eventName: string,
    config: { ttl: number; limit: number },
  ): Promise<number> {
    try {
      const adjustedLimit = this.getEnvironmentAdjustedLimit(config.limit);
      const key = this.getRedisKey(userId, eventName);
      const now = Date.now();
      const windowStart = now - config.ttl;

      await this.redis.zRemRangeByScore(key, 0, windowStart);
      const count = await this.redis.zCard(key);

      return Math.max(0, adjustedLimit - count);
    } catch (error) {
      this.logger.error(`Get remaining requests error: ${error.message}`);
      return config.limit; // Fail open
    }
  }

  /**
   * Reset rate limit for a specific user and event
   * Useful for testing or admin operations
   *
   * @param userId - User ID
   * @param eventName - WebSocket event name
   */
  async resetLimit(userId: string, eventName: string): Promise<void> {
    try {
      const key = this.getRedisKey(userId, eventName);
      await this.redis.del(key);
      this.logger.log(`Rate limit reset for user ${userId} on event ${eventName}`);
    } catch (error) {
      this.logger.error(`Reset limit error: ${error.message}`);
    }
  }

  /**
   * Reset all rate limits for a user (all events)
   *
   * Uses SCAN instead of KEYS for production safety.
   * SCAN is non-blocking and cursor-based, preventing Redis performance issues.
   *
   * @param userId - User ID
   */
  async resetAllLimitsForUser(userId: string): Promise<void> {
    try {
      const pattern = `${this.appNamespace}:ws-ratelimit:${userId}:*`;
      const keys: string[] = [];
      let cursor = '0';

      // Use SCAN instead of KEYS to avoid blocking Redis
      do {
        const result = await this.redis.scan(cursor, {
          MATCH: pattern,
          COUNT: 100,
        });
        cursor = result.cursor.toString();
        keys.push(...result.keys);
      } while (cursor !== '0');

      if (keys.length > 0) {
        await this.redis.del(keys);
        this.logger.log(`All rate limits reset for user ${userId} (${keys.length} events)`);
      }
    } catch (error) {
      this.logger.error(`Reset all limits error: ${error.message}`);
    }
  }

  /**
   * Generate Redis key for rate limiting
   *
   * Includes app namespace to prevent key collisions in shared Redis instances.
   * Format: {appNamespace}:ws-ratelimit:{userId}:{eventName}
   *
   * @param userId - User ID
   * @param eventName - WebSocket event name
   * @returns Redis key
   */
  private getRedisKey(userId: string, eventName: string): string {
    return `${this.appNamespace}:ws-ratelimit:${userId}:${eventName}`;
  }

  /**
   * Apply environment-specific limit adjustments
   *
   * @param baseLimit - Base limit from configuration
   * @returns Adjusted limit based on environment
   */
  private getEnvironmentAdjustedLimit(baseLimit: number): number {
    if (this.environment === 'development') {
      return baseLimit * 10; // 10x in dev for easier testing
    }
    if (this.environment === 'test') {
      return 99999; // Essentially unlimited in test
    }
    return baseLimit;
  }

  /**
   * Log rate limit violation
   *
   * @param userId - User ID
   * @param eventName - WebSocket event name
   * @param currentCount - Current request count
   * @param limit - Rate limit
   * @param windowMs - Time window in milliseconds
   */
  private logViolation(
    userId: string,
    eventName: string,
    currentCount: number,
    limit: number,
    windowMs: number,
  ): void {
    this.logger.warn(
      `WebSocket rate limit exceeded: ` +
      `User ${userId} | ` +
      `Event: ${eventName} | ` +
      `Count: ${currentCount}/${limit} | ` +
      `Window: ${windowMs}ms`,
    );

    // TODO: Implement metrics tracking
    // - Count violations by user
    // - Count violations by event type
    // - Alert on suspicious patterns (e.g., same user hitting multiple limits)
  }
}
