import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { GoalsModule } from './modules/goals/goals.module';
import { ProgramsModule } from './modules/programs/programs.module';
import { ConsultationModule } from './modules/consultation/consultation.module';
import { WorkoutsModule } from './modules/workouts/workouts.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import {
  appConfig,
  supabaseConfig,
  databaseConfig,
  redisConfig,
} from './config';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [appConfig, supabaseConfig, databaseConfig, redisConfig],
    }),

    // Rate limiting
    ThrottlerModule.forRoot([{
      ttl: 60000, // 60 seconds
      limit: 10,  // 10 requests per minute
    }]),
    
    // Core modules
    PrismaModule,
    RedisModule, // Distributed locks, caching, WebSocket adapter
    
    // Feature Modules
    AuthModule,
    ConsultationModule, // Onboarding, availability
    WorkoutsModule, // Scheduling, live sessions (Phase 1: scheduling only)
    GoalsModule,
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
  ],
})
export class AppModule {}
