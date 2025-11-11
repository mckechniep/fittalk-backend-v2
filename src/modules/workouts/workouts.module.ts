// workouts.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { SchedulingController } from './scheduling/scheduling.controller';
import { SchedulingService } from './scheduling/scheduling.service';
import { PlannerService } from './scheduling/planner.service';
import { LiveController } from './live/live.controller';
import { LiveSessionService } from './live/live.service';
import { SessionStateService } from './live/session-state.service';
import { LiveGateway } from './live/live.gateway';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../../common/redis/redis.module';
import { ConsultationModule } from '../consultation/consultation.module';
import { WebSocketRateLimiterService } from '../../common/guards/throttler/websocket-rate-limiter.service';
import { NotificationsModule } from '../notifications/notifications.module';


/**
 * Workouts Module
 *
 * Encapsulates all workout scheduling and real-time session functionality.
 *
 * Phase 1 (Implemented):
 * - Scheduling: Generate weekly workout schedules fitting user availability
 * - Algorithm: Backtracking with pruning for optimal workout placement
 *
 * Phase 2 (Implemented):
 * - Live Sessions: Real-time WebSocket for active workout tracking
 * - Session state: Finite state machine (idle → exercising ↔ resting ↔ paused → completed)
 * - Multi-device: Broadcast state to all user devices via Socket.io
 * - Persistence: PostgreSQL (session metadata) + Redis (real-time state)
 *
 * Controllers:
 * - SchedulingController: /workouts/schedule routes (generate, fetch, cancel)
 * - LiveController: /workouts/live routes (session management, state queries)
 *
 * Services:
 * - PlannerService: Pure algorithm (fits workouts into availability windows)
 * - SchedulingService: Orchestration (DB, Redis locks, planner coordination)
 * - LiveSessionService: Session lifecycle management (create, end, cancel)
 * - SessionStateService: Finite state machine (Redis-backed)
 *
 * Gateways:
 * - LiveGateway: WebSocket gateway for real-time session events (/live namespace)
 *
 * Dependencies:
 * - PrismaModule: Database access (@Global, no need to import but listed for clarity)
 * - RedisModule: Distributed locks, WebSocket adapter, session state (@Global)
 * - ConsultationModule: Access to availability data for scheduling
 *
 * Exports:
 * - SchedulingService: Other modules may trigger schedule generation (e.g., AI module)
 * - LiveSessionService: Other modules may query active session state
 *
 * Design decisions:
 * - One module for scheduling + live sessions (same bounded context)
 * - Scheduling and live split into subfolders (clear separation within module)
 * - Services exported: Inter-module dependencies (AI triggers scheduling)
 * - Controllers not exported: HTTP layer is module-internal
 * - RedisModule explicitly imported: Though @Global, explicit shows dependency
 * - ConsultationModule imported: Needs availability data for schedule generation
 *
 * Why not split into two modules:
 * - Scheduling and live sessions are tightly coupled (same domain)
 * - Share models: ScheduledWorkout, LiveWorkoutSession, WorkoutPlan
 * - Natural transactions: finish live session → update scheduled workout status
 * - Simpler testing: One integration test suite
 * - Follows consultation module pattern: multiple controllers in one module
 */
@Module({
  imports: [
    PrismaModule, // Database access (@Global but listed for clarity)
    RedisModule, // Distributed locks, caching, WebSocket adapter (@Global)
    ConsultationModule, // Provides ConsultationService for availability access
    forwardRef(() => NotificationsModule), // forwardRef to break circular dependency
  ],
  controllers: [
    SchedulingController, // /workouts/schedule routes (Phase 1)
    LiveController, // /workouts/live routes (Phase 2)
  ],
  providers: [
    // Phase 1: Scheduling
    PlannerService, // Pure scheduling algorithm
    SchedulingService, // Schedule generation orchestration

    // Phase 2: Live Sessions
    SessionStateService, // Finite state machine (Redis-backed)
    LiveSessionService, // Session lifecycle management
    LiveGateway, // WebSocket gateway for real-time events
    WebSocketRateLimiterService, // WebSocket rate limiting
  ],
  exports: [
    SchedulingService, // Available for AI module, cron jobs, event handlers
    LiveSessionService, // Available for other modules to query active sessions
  ],
})
export class WorkoutsModule {}
