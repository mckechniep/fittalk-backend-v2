import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { FcmService } from './services/fcm.service';
import { EmailService } from './services/email.service';
import { SchedulerService } from './services/scheduler.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { WorkoutsModule } from '../workouts/workouts.module';

/**
 * Notifications Module
 * 
 * Comprehensive notification system supporting:
 * - Push notifications (Firebase Cloud Messaging)
 * - Email notifications (Resend) - ONLY for consultation summaries and monthly reviews
 * - Real-time notifications (WebSocket via WorkoutsModule gateway)
 * - Scheduled reminders (Cron jobs for workout reminders)
 * 
 * Architecture:
 * - NotificationsService: Core orchestration, database operations
 * - FcmService: Push notification delivery via Firebase
 * - EmailService: Email delivery via Resend (limited use cases)
 * - SchedulerService: Cron jobs for workout reminders
 * 
 * Integration Points:
 * - Consultation completion → "Plan ready" notification + email summary
 * - Workout scheduling → Reminders before workout starts
 * - Workout completion → PR achievements, milestones
 * - Monthly cron → End of month review email
 * 
 * Dependencies:
 * - PrismaModule: Database access for Notification, Device, Preference
 * - WorkoutsModule: Access to LiveGateway for WebSocket broadcasting
 * - ScheduleModule: Cron job support (@nestjs/schedule)
 * 
 * Exports:
 * - NotificationsService: Available to other modules for triggering notifications
 * 
 * Design Decisions:
 * - Service exported: Other modules trigger notifications via events
 * - FCM as primary channel: Push to all user devices
 * - Email sparingly: Only consultation summaries and monthly reviews
 * - WebSocket reuse: Use existing LiveGateway with namespace separation
 * - User preferences: Respect Preference.notifPush flag
 * - Delivery tracking: Record sentAt timestamp in database
 */
@Module({
  imports: [
    PrismaModule,        // Database access
    ScheduleModule,      // Cron jobs
    WorkoutsModule,      // Access to LiveGateway for WebSocket
  ],
  controllers: [
    NotificationsController, // HTTP endpoints
  ],
  providers: [
    NotificationsService,    // Core orchestration
    NotificationsGateway,
    FcmService,             // Push notifications
    EmailService,           // Email delivery (limited)
    SchedulerService,       // Scheduled reminders
  ],
  exports: [
    NotificationsService,    // Available to other modules
    NotificationsGateway,
  ],
})
export class NotificationsModule {}
