// workout-logging.module.ts
import { Module } from '@nestjs/common';
import { WorkoutLoggingController } from './workout-logging.controller';
import { WorkoutLoggingService } from './workout-logging.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module'; 


/**
 * Workout Logging Module
 *
 * Encapsulates all workout logging and performance tracking functionality.
 *
 * Responsibilities:
 * - Log completed workouts with sets and performance data
 * - Track actual performance vs prescribed (adherence)
 * - Provide workout history with filtering
 * - Support both programmed and ad-hoc workouts
 * - Calculate derived metrics (volume, e1RM, trends)
 *
 * Controller:
 * - WorkoutLoggingController: /workout-logging routes (CRUD operations)
 *
 * Service:
 * - WorkoutLoggingService: Business logic, validation, database access
 *
 * Dependencies:
 * - PrismaModule: Database access (@Global, provides PrismaService)
 *
 * Exports:
 * - WorkoutLoggingService: Available to other modules
 *   - AI module: Analyzes workout history for plan adjustments
 *   - Analytics module: Calculates progress metrics
 *   - Live session module: Converts live session to workout log on completion
 *   - Profile module: Displays recent workout activity
 *
 * Design decisions:
 * - Single controller: All logging operations in one place
 * - Service exported: Other modules need workout history data
 * - No sub-modules: Logging is straightforward CRUD, no need for complexity
 * - Uses PrismaModule: Global database access
 *
 * Integration with other modules:
 * - Workouts module: Live sessions convert to workout logs on completion
 * - Analytics: Queries logs for progress tracking, volume calculations
 * - AI: Uses log history for plan personalization and adjustment
 * - Profile: Shows "Last workout: Bench Press, 3 days ago"
 *
 * Future enhancements:
 * - Add analytics service for computed metrics (volume, e1RM trends)
 * - Add personal records tracking (automatic PR detection)
 * - Add workout templates from successful logs
 * - Add social sharing (optional workout log sharing)
 */
@Module({
    imports: [
        PrismaModule, // Database access (@Global but listed for clarity)
        NotificationsModule,
    ],
    controllers: [
        WorkoutLoggingController, // /workout-logging routes
    ],
    providers: [
        WorkoutLoggingService, // Business logic
    ],
    exports: [
        WorkoutLoggingService, // Available to AI, Analytics, Live Sessions, Profile modules
    ],
})
export class WorkoutLoggingModule { }
