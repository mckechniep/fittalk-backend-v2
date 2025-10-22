// common/redis/redis.module.ts
import { Global, Module, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import type { RedisClientType } from 'redis';

/**
 * Redis Module Factory
 * 
 * Provides Redis client for distributed operations across the application.
 * 
 * Uses node-redis (redis package v5.x) NOT ioredis.
 * Your package.json has "redis": "^5.8.3" installed.
 * 
 * Design decisions:
 * - @Global() decorator: Redis available everywhere (like PrismaService)
 * - Single client instance: Shared connection pool across app
 * - Async factory: Ensures connection established before app starts
 * - Graceful shutdown: Disconnects cleanly on app termination
 * - Fail-fast: App won't start if Redis unreachable
 * 
 * Use cases:
 * - Distributed locks (schedule generation, session state)
 * - Socket.io adapter (WebSocket multi-instance broadcasting)
 * - Caching (consultation questions, workout plans)
 * - Presence tracking (active workout sessions)
 * - Rate limiting (via @nestjs/throttler with Redis store)
 * 
 * Connection lifecycle:
 * 1. Module initialization → create client → connect
 * 2. App running → client available for injection
 * 3. App shutdown → onModuleDestroy → disconnect
 * 
 * Environment configuration:
 * - REDIS_URL: Connection string (default: redis://localhost:6379)
 * - Example: redis://username:password@host:6379/0
 * - Supports TLS: rediss://host:6379
 * - Supports cluster: Not configured yet (single-instance Redis)
 */

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: async (configService: ConfigService): Promise<RedisClientType> => {
        const redisUrl = configService.get<string>('redis.url');

        if (!redisUrl) {
          throw new Error('REDIS_URL environment variable is required');
        }

        const client = createClient({
          url: redisUrl,
          // Connection options
          socket: {
            reconnectStrategy: (retries) => {
              // Exponential backoff: 100ms, 200ms, 400ms, 800ms, max 3000ms
              const delay = Math.min(100 * Math.pow(2, retries), 3000);
              console.log(`Redis reconnecting (attempt ${retries + 1}), delay: ${delay}ms`);
              return delay;
            },
            connectTimeout: 10000, // 10 second connection timeout
          },
        }) as RedisClientType;

        // Error handling
        client.on('error', (err) => {
          console.error('Redis Client Error:', err);
        });

        client.on('connect', () => {
          console.log('Redis client connected');
        });

        client.on('ready', () => {
          console.log('Redis client ready');
        });

        client.on('reconnecting', () => {
          console.log('Redis client reconnecting...');
        });

        client.on('end', () => {
          console.log('Redis client connection closed');
        });

        // Connect to Redis
        try {
          await client.connect();
          console.log('Redis connection established successfully');

          // Test connectivity
          await client.ping();
          console.log('Redis connectivity test passed');
        } catch (error) {
          console.error('Failed to connect to Redis:', error);
          throw error; // Fail fast - app should not start without Redis
        }

        return client;
      },
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClientType) {}

  /**
   * Disconnect from Redis on module destroy.
   * Ensures clean shutdown.
   */
  async onModuleDestroy() {
    try {
      await this.redis.disconnect();
      console.log('Redis client disconnected');
    } catch (error) {
      console.error('Error disconnecting Redis:', error);
    }
  }
}
