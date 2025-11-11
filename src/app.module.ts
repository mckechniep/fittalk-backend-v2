import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { CommonServicesModule } from './common/services/common-services.module';
import { AuthModule } from './modules/auth/auth.module';
import { ConsultationModule } from './modules/consultation/consultation.module';
import { ProgramsModule } from './modules/programs/programs.module';
import { WorkoutsModule } from './modules/workouts/workouts.module';
import { WorkoutLoggingModule } from './modules/workout-logging/workout-logging.module';
import { NutritionModule } from './modules/nutrition/nutrition.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AdminModule } from './modules/admin/admin.module';
import { SupportModule } from './modules/support/support.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { CustomThrottlerGuard } from './common/guards/throttler/custom-throttler.guard';
import { RolesGuard } from './common/guards/roles.guard';
import {
  appConfig,
  supabaseConfig,
  databaseConfig,
  redisConfig,
  cacheConfig,
  transactionConfig,
  throttleConfig,
} from './config';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [
        appConfig,
        supabaseConfig,
        databaseConfig,
        redisConfig,
        cacheConfig,
        transactionConfig,
        throttleConfig,
      ],
    }),

    // Cache (in-memory caching for food items, etc.)
    CacheModule.register({
      isGlobal: true,
      ttl: 1800000, // 30 minutes default TTL (in milliseconds)
      max: 100, // Maximum number of items in cache
    }),

    // Rate limiting with Redis storage (production-ready, distributed)
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('redis.url') || 'redis://localhost:6379';
        return {
          throttlers: [
            {
              ttl: config.get<number>('throttle.global.ttl', 60000), // 60 seconds default
              limit: config.get<number>('throttle.global.limit', 10), // 10 requests/min default
            },
          ],
          // Redis storage for distributed rate limiting across multiple instances
          // Using Redis connection string from environment
          storage: new ThrottlerStorageRedisService(redisUrl),
        };
      },
    }),

    // Infrastructure modules (@Global - available everywhere)
    PrismaModule, // Database access
    RedisModule, // Distributed locks, caching, WebSocket adapter
    CommonServicesModule, // Shared services (OwnershipValidator, etc.)

    // Feature modules
    AuthModule, // Authentication, user management
    ConsultationModule, // Onboarding, availability
    WorkoutsModule, // Scheduling, live sessions (Phase 1: scheduling only)
    WorkoutLoggingModule, // Workout logging and performance tracking
    NutritionModule, // Nutrition tracking, meal logging, grocery lists
    NotificationsModule, // Notifications (push, email, WebSocket)
    AdminModule, // Admin operations (user management, system stats, audit logs)
    SupportModule, // Support tickets and customer service
    ProgramsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global JWT Auth Guard
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Global Roles Guard (must run after JWT Auth Guard)
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    // Global Custom Throttler Guard (with logging and metrics)
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
  ],
})
export class AppModule {}
