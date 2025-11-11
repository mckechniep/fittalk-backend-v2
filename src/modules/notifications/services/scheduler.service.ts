import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsService } from '../notifications.service';
import { EmailService } from './email.service';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Scheduler Service
 * 
 * Handles cron-based scheduled tasks for notifications.
 * 
 * Scheduled Tasks:
 * 1. Process pending scheduled notifications (every minute)
 * 2. Send monthly review emails (first day of month at 9am)
 * 
 * Workout Reminders Flow:
 * 1. User schedules workout (via SchedulingService)
 * 2. NotificationsService creates scheduled notification
 * 3. This service picks up notification at scheduled time
 * 4. Sends via FCM and marks as sent
 * 
 * Monthly Reviews Flow:
 * 1. Cron job runs first day of month
 * 2. Find all users with notifEmail enabled
 * 3. Generate monthly stats, PRs, milestones
 * 4. Send via EmailService
 * 
 * Design Decisions:
 * - Frequent polling: Check every minute for pending notifications
 * - Batch processing: Process up to 100 notifications per run
 * - Idempotent: Safe to run multiple times (checks sentAt)
 * - Fail gracefully: Errors don't crash the app
 * - Logging: Comprehensive logs for debugging
 * 
 * Performance Considerations:
 * - Query optimization: Index on scheduledAt, sentAt
 * - Limit batch size: Don't overwhelm FCM API
 * - Error handling: Continue processing even if individual sends fail
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly emailService: EmailService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Process pending scheduled notifications
   * 
   * Runs every minute to check for notifications ready to send.
   * 
   * Query:
   * - scheduledAt <= now
   * - sentAt = null (not sent yet)
   * 
   * Processing:
   * - Send via appropriate channels (FCM, WebSocket)
   * - Mark as sent (sentAt timestamp)
   * - Handle errors gracefully
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processPendingNotifications(): Promise<void> {
    try {
      const pending =
        await this.notificationsService.getPendingScheduledNotifications();

      if (pending.length === 0) {
        // Don't log every minute if no notifications - too noisy
        return;
      }

      this.logger.log(
        `Processing ${pending.length} pending scheduled notification(s)`,
      );

      for (const notification of pending) {
        try {
          // Send notification
          await this.notificationsService.sendNotification({
            userId: notification.userId,
            type: notification.type,
            title: notification.title,
            body: notification.body || undefined,
            meta: notification.meta as Record<string, any> | undefined,
          });

          // Mark original scheduled notification as sent
          await this.notificationsService.markAsSent(notification.id);

          this.logger.log(
            `Sent scheduled notification ${notification.id} for user ${notification.userId}`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to send scheduled notification ${notification.id}: ${error.message}`,
            error.stack,
          );
          // Continue processing other notifications
        }
      }

      this.logger.log(
        `Completed processing ${pending.length} scheduled notification(s)`,
      );
    } catch (error) {
      this.logger.error(
        `Error in processPendingNotifications: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Send monthly review emails
   * 
   * Runs on the 1st of each month at 9:00 AM UTC.
   * 
   * Processing:
   * - Find all users with notifEmail enabled
   * - Generate monthly stats, PRs, milestones
   * - Send via EmailService
   * - Log results
   * 
   * Note: This is a heavy operation, so it runs only once per month.
   */
  @Cron('0 9 1 * *') // At 9:00 AM on the 1st day of every month
  async sendMonthlyReviews(): Promise<void> {
    try {
      this.logger.log('Starting monthly review email send...');

      // Get all users with email notifications enabled
      const users = await this.prisma.user.findMany({
        where: {
          preferences: {
            notifEmail: true,
          },
        },
        select: {
          id: true,
          email: true,
        },
      });

      this.logger.log(`Found ${users.length} users with email enabled`);

      let successCount = 0;
      let errorCount = 0;

      // Send to each user (batched to avoid rate limits)
      for (const user of users) {
        try {
          await this.emailService.sendMonthlyReviewEmail(user.id);
          successCount++;

          // Rate limiting: Wait 100ms between sends to respect Resend limits
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          this.logger.error(
            `Failed to send monthly review to user ${user.id}: ${error.message}`,
          );
          errorCount++;
        }
      }

      this.logger.log(
        `Monthly review send complete: ${successCount} successful, ${errorCount} failed`,
      );
    } catch (error) {
      this.logger.error(
        `Error in sendMonthlyReviews: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Clean up old notifications (runs daily)
   * 
   * Deletes notifications older than 90 days to keep database clean.
   * 
   * Design decision:
   * - Keep 90 days: Users may want to reference recent notifications
   * - Soft delete: Could add deletedAt instead of hard delete
   * - Run daily: Low priority, off-peak hours
   */
  @Cron('0 3 * * *') // At 3:00 AM daily
  async cleanupOldNotifications(): Promise<void> {
    try {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const result = await this.prisma.notification.deleteMany({
        where: {
          createdAt: {
            lt: ninetyDaysAgo,
          },
        },
      });

      this.logger.log(`Cleaned up ${result.count} old notification(s)`);
    } catch (error) {
      this.logger.error(
        `Error in cleanupOldNotifications: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Health check cron (runs every hour)
   * 
   * Logs scheduler status to confirm it's running.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async healthCheck(): Promise<void> {
    this.logger.debug('Scheduler health check: OK');
  }
}
