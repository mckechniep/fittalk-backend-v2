import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsObject,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationType } from '@prisma/client';

/**
 * DTO for sending a notification
 * 
 * Used internally by other modules to trigger notifications.
 * Not exposed via HTTP endpoints (notifications are system-generated).
 */
export class SendNotificationDto {
  @IsString()
  userId: string;

  @IsEnum(NotificationType)
  type: NotificationType;

  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  body?: string;

  @IsObject()
  @IsOptional()
  meta?: Record<string, any>; // Additional data (e.g., workoutId, exerciseId)
}

/**
 * DTO for scheduling a future notification
 * 
 * Used for workout reminders (e.g., "remind me 30 minutes before workout").
 */
export class ScheduleNotificationDto extends SendNotificationDto {
  @IsDateString()
  scheduledAt: string; // ISO 8601 datetime

  @IsInt()
  @Min(0)
  @Max(1440) // Max 24 hours in minutes
  @IsOptional()
  reminderMinutesBefore?: number; // For workout reminders
}

/**
 * DTO for updating user notification preferences
 * 
 * Used by users to configure their notification settings.
 */
export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  workoutReminderMinutes?: number; // How many minutes before workout to send reminder

  // Note: Push/email/SMS toggles are in Preference table, not here
  // This DTO is for notification-specific preferences
}

/**
 * Response DTO for notification details
 */
export class NotificationResponseDto {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  sentAt: Date | null;
  scheduledAt: Date | null;
  meta: Record<string, any> | null;
  createdAt: Date;

  constructor(partial: Partial<NotificationResponseDto>) {
    Object.assign(this, partial);
  }
}

/**
 * Response DTO for paginated notifications list
 */
export class NotificationsListResponseDto {
  notifications: NotificationResponseDto[];
  total: number;
  unreadCount: number;

  constructor(partial: Partial<NotificationsListResponseDto>) {
    Object.assign(this, partial);
  }
}
