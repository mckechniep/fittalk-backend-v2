import {
  Controller,
  Get,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { FrequentRead } from '../../common/guards/throttler/throttler.decorators';
import {
  NotificationsListResponseDto,
} from './dtos';

/**
 * Notifications Controller
 * 
 * HTTP endpoints for user notification management.
 * 
 * Design decisions:
 * - Read-only: No POST/PUT/DELETE (notifications are system-generated)
 * - Pagination: Support large notification histories
 * - User-scoped: Users can only see their own notifications
 * - Sorted by date: Newest first
 * 
 * Routes:
 * - GET /notifications - Get user's notification history
 * 
 * Future enhancements:
 * - PATCH /notifications/:id/read - Mark as read
 * - DELETE /notifications/:id - Delete notification
 * - GET /notifications/unread/count - Get unread count
 * - PATCH /notifications/mark-all-read - Mark all as read
 */
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * GET /notifications
   * 
   * Get user's notification history (paginated).
   * 
   * Query parameters:
   * - limit: Max results (default: 20, max: 100)
   * - skip: Pagination offset (default: 0)
   * 
   * Response:
   * {
   *   "notifications": [...],
   *   "total": 42,
   *   "unreadCount": 3
   * }
   * 
   * Sorted by createdAt descending (newest first).
   * 
   * Use cases:
   * - Notification center in app
   * - Notification history view
   * - Pull-to-refresh in mobile app
   * 
   * Rate limit: 60/min (frequent reads)
   */
  @Get()
  @FrequentRead() // 60/min
  async getNotifications(
    @CurrentUser('id') userId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
  ): Promise<NotificationsListResponseDto> {
    // Enforce max limit
    const safeLimit = Math.min(limit, 100);

    return this.notificationsService.getUserNotifications(
      userId,
      safeLimit,
      skip,
    );
  }

  // Future endpoints:
  // 
  // @Patch(':id/read')
  // async markAsRead(@CurrentUser('id') userId: string, @Param('id') notificationId: string) { ... }
  //
  // @Delete(':id')
  // async deleteNotification(@CurrentUser('id') userId: string, @Param('id') notificationId: string) { ... }
  //
  // @Get('unread/count')
  // async getUnreadCount(@CurrentUser('id') userId: string) { ... }
  //
  // @Patch('mark-all-read')
  // async markAllAsRead(@CurrentUser('id') userId: string) { ... }
}
