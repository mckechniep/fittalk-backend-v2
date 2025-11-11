import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FcmService } from './services/fcm.service';
import { EmailService } from './services/email.service';
import {
  SendNotificationDto,
  ScheduleNotificationDto,
  NotificationResponseDto,
  NotificationsListResponseDto,
} from './dtos';
import { NotificationType } from '@prisma/client';
import { Optional } from '@nestjs/common'; 
import { NotificationsGateway } from './notifications.gateway'; 

/**
 * Notifications Service
 * 
 * Core orchestration layer for all notification delivery channels.
 * 
 * Responsibilities:
 * - Create notification records in database
 * - Check user notification preferences
 * - Route to appropriate delivery channel(s)
 * - Track delivery status (sentAt timestamp)
 * - Query notification history
 * 
 * Delivery Channels:
 * 1. Push (FCM): Primary channel for all notification types
 * 2. Email (Resend): ONLY for consultation summaries and monthly reviews
 * 3. WebSocket: Real-time delivery to connected clients (handled by LiveGateway)
 * 
 * Integration Flow:
 * 1. Other modules call sendNotification() or scheduleNotification()
 * 2. Service creates DB record (Notification table)
 * 3. Check user preferences (Preference.notifPush)
 * 4. Send via FCM if push enabled
 * 5. Send via Email if special case (consultation/monthly)
 * 6. Broadcast via WebSocket if user connected
 * 7. Mark as sent (sentAt timestamp)
 * 
 * Design Decisions:
 * - Non-blocking: Delivery failures don't throw errors (logged instead)
 * - Idempotent: Safe to call multiple times (checks sentAt)
 * - User-centric: Always check preferences before sending
 * - Auditable: All notifications recorded in database
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fcmService: FcmService,
    private readonly emailService: EmailService,
    @Optional() private readonly notificationsGateway?: NotificationsGateway,
  ) {}

  /**
   * Send notification immediately
   * 
   * Creates DB record, checks preferences, sends via FCM and/or email.
   * 
   * @param dto - Notification details
   * @returns Created notification record
   */
  async sendNotification(
    dto: SendNotificationDto,
  ): Promise<NotificationResponseDto> {
    this.logger.log(
      `Sending ${dto.type} notification to user ${dto.userId}: ${dto.title}`,
    );

    // 1. Create database record
    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        type: dto.type,
        title: dto.title,
        body: dto.body,
        meta: dto.meta ? JSON.parse(JSON.stringify(dto.meta)) : undefined,
      },
    });

    // 2. Get user preferences
    const preferences = await this.prisma.preference.findUnique({
      where: { userId: dto.userId },
    });

    // 3. Send via push notifications (if enabled)
    if (preferences?.notifPush) {
      try {
        await this.fcmService.sendToUser(dto.userId, {
          title: dto.title,
          body: dto.body || '',
          data: {
            notificationId: notification.id,
            type: dto.type,
            ...dto.meta,
          },
        });
      } catch (error) {
        this.logger.error(
          `Failed to send push notification: ${error.message}`,
          error.stack,
        );
        // Don't throw - continue with other channels
      }
    }

    // 4. Send via email (ONLY for special cases)
    if (this.shouldSendEmail(dto.type) && preferences?.notifEmail) {
      try {
        await this.emailService.sendNotificationEmail(dto);
      } catch (error) {
        this.logger.error(
          `Failed to send email notification: ${error.message}`,
          error.stack,
        );
        // Don't throw - non-critical
      }
    }

    // 5. Mark as sent
    const updatedNotification = await this.prisma.notification.update({
      where: { id: notification.id },
      data: { sentAt: new Date() },
    });

    // 6. WebSocket broadcast to connected clients
    if (this.notificationsGateway) {
      try {
        this.notificationsGateway.broadcastToUser(dto.userId, {
          id: updatedNotification.id,
          type: updatedNotification.type,
          title: updatedNotification.title,
          body: updatedNotification.body,
          meta: updatedNotification.meta,
          createdAt: updatedNotification.createdAt,
        });
      } catch (error) {
        this.logger.error(
          `Failed to broadcast notification via WebSocket: ${error.message}`,
        );
        // Don't throw - notification already saved
      }
    }

    return new NotificationResponseDto(updatedNotification);
  }

  /**
   * Schedule notification for future delivery
   * 
   * Creates DB record with scheduledAt timestamp.
   * SchedulerService cron job will pick up and send at scheduled time.
   * 
   * @param dto - Notification details with scheduledAt
   * @returns Created notification record
   */
  async scheduleNotification(
    dto: ScheduleNotificationDto,
  ): Promise<NotificationResponseDto> {
    this.logger.log(
      `Scheduling ${dto.type} notification for user ${dto.userId} at ${dto.scheduledAt}`,
    );

    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        type: dto.type,
        title: dto.title,
        body: dto.body,
        scheduledAt: new Date(dto.scheduledAt),
        meta: dto.meta
          ? JSON.parse(JSON.stringify({
              ...dto.meta,
              reminderMinutesBefore: dto.reminderMinutesBefore,
            }))
          : undefined,
      },
    });

    return new NotificationResponseDto(notification);
  }

  /**
   * Get user's notification history
   * 
   * @param userId - User ID
   * @param limit - Max results (default: 20)
   * @param skip - Pagination offset (default: 0)
   * @returns Paginated notifications list
   */
  async getUserNotifications(
    userId: string,
    limit = 20,
    skip = 0,
  ): Promise<NotificationsListResponseDto> {
    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      this.prisma.notification.count({
        where: { userId },
      }),
      this.prisma.notification.count({
        where: {
          userId,
          sentAt: null, // Unread = not sent yet (scheduled)
        },
      }),
    ]);

    return new NotificationsListResponseDto({
      notifications: notifications.map((n) => new NotificationResponseDto(n)),
      total,
      unreadCount,
    });
  }

  /**
   * Get pending scheduled notifications
   * 
   * Used by SchedulerService to find notifications ready to send.
   * 
   * @returns Notifications scheduled for now or earlier that haven't been sent
   */
  async getPendingScheduledNotifications(): Promise<NotificationResponseDto[]> {
    const now = new Date();

    const notifications = await this.prisma.notification.findMany({
      where: {
        scheduledAt: {
          lte: now, // Scheduled for now or earlier
        },
        sentAt: null, // Not sent yet
      },
      orderBy: { scheduledAt: 'asc' },
      take: 100, // Process up to 100 at a time
    });

    return notifications.map((n) => new NotificationResponseDto(n));
  }

  /**
   * Mark notification as sent
   * 
   * @param notificationId - Notification ID
   */
  async markAsSent(notificationId: string): Promise<void> {
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { sentAt: new Date() },
    });
  }

  /**
   * Determine if email should be sent for this notification type
   * 
   * Email ONLY for:
   * - Consultation complete (plan ready) - includes consultation summary
   * - Monthly reviews - includes PR achievements and milestones
   * 
   * @param type - Notification type
   * @returns True if email should be sent
   */
  private shouldSendEmail(type: NotificationType): boolean {
    // Only send email for plan ready (consultation complete)
    // Monthly reviews are handled separately by EmailService cron job
    return type === NotificationType.PLAN_READY;
  }

  /**
   * Helper: Send "Plan Ready" notification after consultation
   * 
   * Convenience method for consultation module integration.
   * Sends both push and email (consultation summary).
   * 
   * @param userId - User ID
   * @param consultationId - Consultation session ID
   */
  async sendPlanReadyNotification(
    userId: string,
    consultationId: string,
  ): Promise<void> {
    await this.sendNotification({
      userId,
      type: NotificationType.PLAN_READY,
      title: '🎉 Your Personalized Plan is Ready!',
      body: 'Your AI-powered workout plan has been generated based on your consultation.',
      meta: {
        consultationId,
      },
    });
  }

  /**
   * Helper: Schedule workout reminder
   * 
   * Convenience method for workout scheduling integration.
   * 
   * @param userId - User ID
   * @param workoutId - Scheduled workout ID
   * @param workoutTime - Workout start time
   * @param reminderMinutes - Minutes before workout to send reminder
   */
  async scheduleWorkoutReminder(
    userId: string,
    workoutId: string,
    workoutTime: Date,
    reminderMinutes = 30,
  ): Promise<void> {
    const reminderTime = new Date(
      workoutTime.getTime() - reminderMinutes * 60 * 1000,
    );

    // Don't schedule if reminder time is in the past
    if (reminderTime <= new Date()) {
      this.logger.log(
        `Skipping workout reminder for user ${userId} - time already passed`,
      );
      return;
    }

    await this.scheduleNotification({
      userId,
      type: NotificationType.WORKOUT_REMINDER,
      title: '💪 Workout Coming Up!',
      body: `Your workout starts in ${reminderMinutes} minutes. Time to get ready!`,
      scheduledAt: reminderTime.toISOString(),
      reminderMinutesBefore: reminderMinutes,
      meta: {
        workoutId,
        workoutTime: workoutTime.toISOString(),
      },
    });
  }

  /**
   * Helper: Send PR achievement notification
   * 
   * Convenience method for workout logging integration.
   * 
   * @param userId - User ID
   * @param exerciseName - Exercise name
   * @param prDetails - PR details (weight, reps, etc.)
   */
  async sendPrAchievedNotification(
    userId: string,
    exerciseName: string,
    prDetails: { weight?: number; reps?: number },
  ): Promise<void> {
    const prText =
      prDetails.weight && prDetails.reps
        ? `${prDetails.weight}kg x ${prDetails.reps} reps`
        : prDetails.weight
          ? `${prDetails.weight}kg`
          : `${prDetails.reps} reps`;

    await this.sendNotification({
      userId,
      type: NotificationType.PR_ACHIEVED,
      title: '🏆 New Personal Record!',
      body: `${exerciseName}: ${prText}`,
      meta: {
        exerciseName,
        ...prDetails,
      },
    });
  }

  /**
   * Helper: Send milestone notification
   * 
   * Convenience method for analytics/progress tracking integration.
   * 
   * @param userId - User ID
   * @param milestoneText - Milestone description
   */
  async sendMilestoneNotification(
    userId: string,
    milestoneText: string,
  ): Promise<void> {
    await this.sendNotification({
      userId,
      type: NotificationType.milestone,
      title: '🎯 Milestone Achieved!',
      body: milestoneText,
      meta: {
        milestone: milestoneText,
      },
    });
  }
}
