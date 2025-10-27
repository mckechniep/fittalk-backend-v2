// availability.controller.ts
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ConsultationService } from './consultation.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  UpsertAvailabilityDto,
  AvailabilityWindowResponseDto,
} from './dtos/availability-window.dto';

/**
 * Availability Controller
 *
 * Manages user weekly availability windows for workout scheduling.
 *
 * Design decisions:
 * - Separate from ConsultationController: Availability is independent resource
 * - Used beyond onboarding: Scheduler queries this, users update anytime
 * - RESTful: /availability routes (not nested under /consultation)
 * - Simple CRUD: Create/replace all, read, delete individual
 *
 * Routes:
 * - POST /availability - Upsert all windows (replace strategy)
 * - GET /availability - Get user's windows
 * - DELETE /availability/:id - Delete single window
 *
 * Security:
 * - All routes require JWT authentication
 * - Users can only manage their own availability
 *
 * Use cases:
 * - Onboarding: User sets initial weekly schedule
 * - Schedule update: User changes work hours, adds/removes time blocks
 * - Quick edit: Remove one conflicting time slot
 * - Scheduler integration: Query available times for workout placement
 */
@Controller('availability')
@UseGuards(JwtAuthGuard)
export class AvailabilityController {
  constructor(private readonly consultationService: ConsultationService) {}

  /**
   * POST /availability
   *
   * Create or replace all availability windows.
   *
   * Strategy: "Replace all" - atomic delete + insert
   * - Simplifies client logic (send full state)
   * - No partial update bugs
   * - Transactional (all-or-nothing)
   *
   * Request body: { windows: AvailabilityWindowDto[] }
   * - Empty array = clear all availability
   * - Windows validated for overlaps and time ranges
   *
   * Validation (service layer):
   * - No overlapping windows on same day
   * - startMin < endMin for each window
   * - Valid day range (0-6) and time range (0-1439)
   *
   * Returns: Created windows with database IDs
   * Status: 201 Created
   *
   * Example:
   * POST /availability
   * {
   *   "windows": [
   *     { "dayOfWeek": 1, "startMin": 540, "endMin": 1020, "priority": 2 },
   *     { "dayOfWeek": 3, "startMin": 360, "endMin": 720 }
   *   ]
   * }
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async upsertAvailability(
    @CurrentUser('id') userId: string,
    @Body() dto: UpsertAvailabilityDto,
  ): Promise<AvailabilityWindowResponseDto[]> {
    return this.consultationService.upsertAvailability(userId, dto);
  }

  /**
   * GET /availability
   *
   * Get user's current availability windows.
   *
   * Returns: Array ordered by day (Sun-Sat), then start time
   * Empty array if no availability set
   *
   * Use cases:
   * - Display weekly schedule in settings
   * - Check if user has availability before scheduling
   * - Workout scheduler queries for placement
   * - Onboarding review: "Is this schedule correct?"
   *
   * Response includes:
   * - Window IDs (for individual deletion)
   * - Day, start/end times (in minutes)
   * - Priority (for scheduler optimization)
   * - Timestamps (audit trail)
   *
   * Example response:
   * [
   *   {
   *     "id": "uuid",
   *     "userId": "uuid",
   *     "dayOfWeek": 1,
   *     "startMin": 540,
   *     "endMin": 1020,
   *     "priority": 2,
   *     "createdAt": "2025-01-01T00:00:00Z",
   *     "updatedAt": "2025-01-01T00:00:00Z"
   *   }
   * ]
   */
  @Get()
  async getAvailability(
    @CurrentUser('id') userId: string,
  ): Promise<AvailabilityWindowResponseDto[]> {
    return this.consultationService.getAvailability(userId);
  }

  /**
   * DELETE /availability/:id
   *
   * Delete single availability window.
   *
   * Use case: Remove one time block without re-sending full schedule
   * Example: "I can't do Tuesday mornings anymore, but rest stays same"
   *
   * Alternative to POST (which replaces all):
   * - More granular editing
   * - Less bandwidth for small changes
   * - Better UX for mobile quick-edit
   *
   * Security:
   * - Verifies window belongs to authenticated user
   * - Returns 403 if attempting to delete another user's window
   *
   * Returns: 204 No Content (success, empty body)
   * Throws:
   * - 404 if window not found
   * - 403 if window belongs to different user
   *
   * Example:
   * DELETE /availability/uuid-123
   * → 204 No Content
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAvailabilityWindow(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) windowId: string,
  ): Promise<void> {
    return this.consultationService.deleteAvailabilityWindow(windowId, userId);
  }
}
