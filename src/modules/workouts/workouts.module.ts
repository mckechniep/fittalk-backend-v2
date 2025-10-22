// workouts.module.ts
import { Module } from '@nestjs/common';
import { SchedulingController } from './scheduling/scheduling.controller';
import { SchedulingService } from './scheduling/scheduling.service';
import { PlannerService } from './scheduling/planner.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../../common/redis/redis.module';
import { ConsultationModule } from '../consultation/consultation.module';

/**
 * Workouts Module
 * 
 * Encapsulates all workout scheduling and real-time session functionality.
 * 
 * Current implementation (Phase 1):
 * - Scheduling: Generate weekly workout schedules fitting user availability
 * 
 * Future implementation (Phase 2):
 * - Live Sessions: Real-time WebSocket for active workout tracking
 * - Session state: Start, pause, rest timers, set completion
 * - Multi-device: Broadcast state to all user devices
 * 
 * Controllers:
 * - SchedulingController: /workouts/schedule routes (generate, fetch, cancel)
 * - (Future) LiveController: /workouts/live routes (state queries)
 * 
 * Services:
 * - PlannerService: Pure algorithm (fits workouts into availability windows)
 * - SchedulingService: Orchestration (DB, Redis locks, planner coordination)
 * - (Future) LiveService: Session state management
 * - (Future) SessionStateService: Finite state machine
 * 
 * Gateways (Future Phase 2):
 * - LiveGateway: WebSocket gateway for real-time session events
 * 
 * Dependencies:
 * - PrismaModule: Database access (@Global, no need to import but listed for clarity)
 * - RedisModule: Distributed locks, WebSocket adapter (@Global)
 * - ConsultationModule: Access to AvailabilityService (workout scheduler needs user availability)
 * 
 * Exports:
 * - SchedulingService: Other modules may trigger schedule generation (e.g., AI module after plan creation)
 * - (Future) LiveService: Other modules may query active session state
 * 
 * Design decisions:
 * - One module for scheduling + live sessions (same bounded context)
 * - Scheduling and live split into subfolders (clear separation within module)
 * - Services exported: Inter-module dependencies (AI triggers scheduling)
 * - Controllers not exported: HTTP layer is module-internal
 * - RedisModule explicitly imported: Though @Global, explicit shows dependency
 * - ConsultationModule imported: Needs ConsultationService for availability access
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
    PrismaModule,       // Database access (@Global but listed for clarity)
    RedisModule,        // Distributed locks, caching, WebSocket adapter (@Global)
    ConsultationModule, // Provides ConsultationService for availability access
  ],
  controllers: [
    SchedulingController, // /workouts/schedule routes
    // Future: LiveController (Phase 2)
  ],
  providers: [
    PlannerService,    // Pure scheduling algorithm
    SchedulingService, // Schedule generation orchestration
    // Future: SessionStateService, LiveService (Phase 2)
  ],
  exports: [
    SchedulingService, // Available for AI module, cron jobs, event handlers
    // Future: LiveService (Phase 2)
  ],
})
export class WorkoutsModule {}
