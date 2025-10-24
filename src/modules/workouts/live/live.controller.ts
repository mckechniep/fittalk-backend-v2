import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { LiveSessionService } from './live.service';
import { SessionStateService } from './session-state.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  CreateLiveSessionDto,
  UpdateLiveSessionDto,
  LiveSessionResponseDto,
  SessionStateSnapshotDto,
  LiveEventDto,
} from './dtos';

/**
 * Live Session Controller
 *
 * Provides HTTP endpoints for live workout session management.
 * All routes require JWT authentication.
 *
 * Responsibilities:
 * - Create and manage live workout sessions
 * - Query session state and history
 * - Handle session lifecycle (start, pause, resume, end)
 * - Provide fallback for WebSocket operations (REST API)
 *
 * Design decisions:
 * - RESTful: /workouts/live as base path
 * - Session creation via POST (WebSocket for real-time updates)
 * - HTTP endpoints for critical operations (reliable fallback)
 * - State queries via GET for client recovery
 *
 * Integration points:
 * - Mobile app creates session before workout starts
 * - WebSocket gateway handles real-time state updates
 * - HTTP used for session management and recovery
 * - Links to ScheduledWorkout for planned sessions
 *
 * Security:
 * - All routes protected by JwtAuthGuard
 * - User can only access/modify their own sessions
 * - Host-only operations (end, cancel) validated in service
 */
@Controller('workouts/live')
@UseGuards(JwtAuthGuard)
export class LiveController {
  constructor(
    private readonly liveService: LiveSessionService,
    private readonly sessionState: SessionStateService,
  ) {}

  /**
   * POST /workouts/live/sessions
   *
   * Create a new live workout session.
   *
   * Request body:
   * {
   *   "title": "Morning Workout",
   *   "description": "Upper body strength",
   *   "scheduledAt": "2025-10-23T10:00:00Z",  // Optional: defaults to now
   *   "workoutPlanId": "uuid",                // Optional: link to plan
   *   "private": true                          // Optional: defaults to false
   * }
   *
   * Response: LiveSessionResponseDto with initial state
   *
   * Use cases:
   * - User starts workout from scheduled workout
   * - User starts ad-hoc workout
   * - Coach creates group workout session
   */
  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  async createSession(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateLiveSessionDto,
  ): Promise<LiveSessionResponseDto> {
    return this.liveService.createSession(userId, dto);
  }

  /**
   * GET /workouts/live/sessions/:id
   *
   * Get session details by ID.
   *
   * Returns full session data including metadata and current state.
   * Used for session recovery and history viewing.
   */
  @Get('sessions/:id')
  async getSession(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ): Promise<LiveSessionResponseDto> {
    return this.liveService.getSession(userId, sessionId);
  }

  /**
   * GET /workouts/live/sessions
   *
   * Get all active sessions for the authenticated user.
   *
   * Query parameters:
   * - None currently (future: pagination, filtering)
   *
   * Returns array of active sessions (not ended).
   */
  @Get('sessions')
  async getUserActiveSessions(
    @CurrentUser('id') userId: string,
  ): Promise<LiveSessionResponseDto[]> {
    return this.liveService.getUserActiveSessions(userId);
  }

  /**
   * PUT /workouts/live/sessions/:id
   *
   * Update session metadata (host only).
   *
   * Request body:
   * {
   *   "title": "Updated title",
   *   "description": "Updated description",
   *   "private": false
   * }
   *
   * Use cases:
   * - Rename session during workout
   * - Update privacy settings
   * - Reschedule if not yet started
   */
  @Put('sessions/:id')
  async updateSession(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Body() dto: UpdateLiveSessionDto,
  ): Promise<LiveSessionResponseDto> {
    return this.liveService.updateSession(userId, sessionId, dto);
  }

  /**
   * POST /workouts/live/sessions/:id/end
   *
   * End a session and persist final state (host only).
   *
   * Idempotent: Safe to call multiple times.
   *
   * Actions:
   * - Complete state machine (transition to 'completed')
   * - Set endedAt timestamp
   * - Persist final state to database
   * - Remove from active sessions
   *
   * Use cases:
   * - User finishes workout
   * - HTTP fallback if WebSocket disconnects
   * - Manual session termination
   */
  @Post('sessions/:id/end')
  @HttpCode(HttpStatus.OK)
  async endSession(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ): Promise<LiveSessionResponseDto> {
    return this.liveService.endSession(userId, sessionId);
  }

  /**
   * DELETE /workouts/live/sessions/:id
   *
   * Cancel and delete a session (host only).
   *
   * Use cases:
   * - User abandons workout before starting
   * - Cleanup test sessions
   * - Remove accidental session creation
   *
   * NOTE: Cannot delete ended sessions (use soft delete if needed)
   */
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelSession(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ): Promise<void> {
    return this.liveService.cancelSession(userId, sessionId);
  }

  /**
   * GET /workouts/live/sessions/:id/state
   *
   * Get current session state snapshot from Redis.
   *
   * Returns real-time state including:
   * - Current status (idle, exercising, resting, paused, completed)
   * - Current exercise and set number
   * - Rest timer state
   * - Last activity timestamp
   *
   * Use cases:
   * - Client recovery after disconnect
   * - Multi-device synchronization
   * - Debugging session state
   */
  @Get('sessions/:id/state')
  async getSessionState(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ): Promise<SessionStateSnapshotDto | null> {
    // Verify user has access to session
    await this.liveService.getSession(userId, sessionId);

    // Return state from Redis
    return this.sessionState.getSnapshot(sessionId);
  }

  /**
   * POST /workouts/live/sessions/:id/heartbeat
   *
   * Record heartbeat to keep session alive.
   *
   * HTTP fallback for WebSocket heartbeat.
   * Extends session TTL in Redis and updates database timestamp.
   *
   * Use cases:
   * - Periodic keepalive from mobile app
   * - Prevent stale session cleanup
   * - Track last activity time
   */
  @Post('sessions/:id/heartbeat')
  @HttpCode(HttpStatus.NO_CONTENT)
  async recordHeartbeat(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ): Promise<void> {
    return this.liveService.recordHeartbeat(userId, sessionId);
  }

  /**
   * POST /workouts/live/sessions/:id/events
   *
   * Record a custom event in the session.
   *
   * Request body: LiveEventDto
   * {
   *   "type": "coach.cue",
   *   "payload": {
   *     "message": "Keep your core tight!"
   *   }
   * }
   *
   * Use cases:
   * - Log coaching cues
   * - Record participant updates
   * - Store metric updates
   * - HTTP fallback for WebSocket events
   */
  @Post('sessions/:id/events')
  @HttpCode(HttpStatus.CREATED)
  async recordEvent(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Body() event: LiveEventDto,
  ): Promise<void> {
    return this.liveService.recordEvent(userId, sessionId, event);
  }

  /**
   * POST /workouts/live/sessions/:id/pause
   *
   * Pause the session (HTTP fallback).
   *
   * Normally handled via WebSocket, but provided as HTTP endpoint
   * for reliability and testing.
   */
  @Post('sessions/:id/pause')
  @HttpCode(HttpStatus.OK)
  async pauseSession(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ): Promise<SessionStateSnapshotDto> {
    // Verify ownership
    await this.liveService.getSession(userId, sessionId);

    return this.sessionState.pause(sessionId);
  }

  /**
   * POST /workouts/live/sessions/:id/resume
   *
   * Resume the session from pause (HTTP fallback).
   */
  @Post('sessions/:id/resume')
  @HttpCode(HttpStatus.OK)
  async resumeSession(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ): Promise<SessionStateSnapshotDto> {
    // Verify ownership
    await this.liveService.getSession(userId, sessionId);

    return this.sessionState.resume(sessionId);
  }

  /**
   * POST /workouts/live/sessions/:id/start-exercise
   *
   * Start a new exercise (HTTP fallback).
   *
   * Request body:
   * {
   *   "exerciseId": "uuid",
   *   "exerciseIndex": 0
   * }
   */
  @Post('sessions/:id/start-exercise')
  @HttpCode(HttpStatus.OK)
  async startExercise(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Body() body: { exerciseId: string; exerciseIndex: number },
  ): Promise<SessionStateSnapshotDto> {
    // Verify ownership
    await this.liveService.getSession(userId, sessionId);

    return this.sessionState.startExercise(
      sessionId,
      body.exerciseId,
      body.exerciseIndex,
    );
  }

  /**
   * POST /workouts/live/sessions/:id/complete-set
   *
   * Complete a set and start rest timer (HTTP fallback).
   *
   * Request body:
   * {
   *   "restDurationMs": 90000  // 90 seconds
   * }
   */
  @Post('sessions/:id/complete-set')
  @HttpCode(HttpStatus.OK)
  async completeSet(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Body() body: { restDurationMs: number },
  ): Promise<SessionStateSnapshotDto> {
    // Verify ownership
    await this.liveService.getSession(userId, sessionId);

    return this.sessionState.completeSet(sessionId, body.restDurationMs);
  }

  /**
   * POST /workouts/live/sessions/:id/end-rest
   *
   * End rest period and continue (HTTP fallback).
   */
  @Post('sessions/:id/end-rest')
  @HttpCode(HttpStatus.OK)
  async endRest(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ): Promise<SessionStateSnapshotDto> {
    // Verify ownership
    await this.liveService.getSession(userId, sessionId);

    return this.sessionState.endRest(sessionId);
  }
}
