import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { CommonServicesModule } from './common/services/common-services.module';
import { AuthModule } from './modules/auth/auth.module';
import { ConsultationModule } from './modules/consultation/consultation.module';
import { WorkoutsModule } from './modules/workouts/workouts.module';
import { WorkoutLoggingModule } from './modules/workout-logging/workout-logging.module';
import { NutritionModule } from './modules/nutrition/nutrition.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
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

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 seconds
        limit: 10, // 10 requests per minute
      },
    ]),

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
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global JWT Auth Guard
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
