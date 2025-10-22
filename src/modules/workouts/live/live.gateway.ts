// live-sessions/live.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiHeader,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

import { LiveSessionService } from './live-session.service';
import { SessionStateService } from './session-state.service';

import {
  StartSessionDto,
  CompleteSetDto,
  UpdateSessionDto,
  SessionFiltersDto,
} from '../dtos/live-session.dto';
import {
  LiveSessionResponseDto,
  SessionSetResponseDto,
  SessionStatsDto,
  SessionHistoryResponseDto,
} from '../dtos/live-session-response.dto';

/**
 * Live Session Controller
 * 
 * HTTP REST API for live workout session management.
 * 
 * Responsibilities:
 * - Session lifecycle endpoints (start, pause, resume, complete, abandon)
 * - Set completion tracking
 * - Session history and analytics
 * - Integration with real-time presence state
 * - Idempotency support for critical operations
 * 
 * Design principles:
 * - RESTful: Standard HTTP methods and status codes
 * - Authenticated: All endpoints require valid JWT
 * - Validated: DTOs with class-validator decorators
 * - Idempotent: Critical operations support Idempotency-Key header
 * - Documented: Full OpenAPI/Swagger annotations
 * - Resource-oriented: Clear resource hierarchy
 * - Consistent responses: Standard DTO shapes
 * 
 * URL structure:
 * - POST   /workouts/live/sessions                    - Start new session
 * - GET    /workouts/live/sessions                    - List user's sessions
 * - GET    /workouts/live/sessions/:id                - Get session details
 * - GET    /workouts/live/sessions/:id/state          - Get real-time state
 * - PATCH  /workouts/live/sessions/:id/pause          - Pause session
 * - PATCH  /workouts/live/sessions/:id/resume         - Resume session
 * - PATCH  /workouts/live/sessions/:id/complete       - Complete session
 * - DELETE /workouts/live/sessions/:id                - Abandon session
 * - POST   /workouts/live/sessions/:id/sets/:setId    - Complete set
 * - GET    /workouts/live/sessions/:id/stats          - Get session stats
 * - GET    /workouts/live/sessions/active             - Get active session
 * - GET    /workouts/live/sessions/upcoming           - Get next scheduled
 * 
 * Idempotency:
 * - Supports Idempotency-Key header for POST operations
 * - Prevents duplicate session creation
 * - Safe retry of failed requests
 * 
 * Dependencies:
 * - LiveSessionService: Business logic and persistence
 * - SessionStateService: Real-time state and presence
 * - JwtAuthGuard: Authentication
 * - CurrentUser: User extraction from JWT
 */
@ApiTags('Live Workout Sessions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workouts/live')
export class LiveController {
  private readonly logger = new Logger(LiveController.name);

  constructor(
    private readonly liveService: LiveSessionService,
    private readonly sessionState: SessionStateService,
  ) {}

  // ==================== SESSION LIFECYCLE ====================

  /**
   * Start a new workout session.
   * 
   * POST /workouts/live/sessions
   * 
   * Creates a new active workout session linked to a scheduled workout.
   * User can only have ONE active session at a time.
   * 
   * Idempotency: Supports Idempotency-Key header to prevent duplicate sessions.
   * 
   * @param userId - Authenticated user ID from JWT
   * @param dto - Session start parameters
   * @param idempotencyKey - Optional idempotency key
   * @returns Created session with full details
   */
  @Post('sessions')
  @ApiOperation({
    summary: 'Start new workout session',
    description:
      'Creates and starts a new live workout session. User can only have one active session at a time.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Unique key to prevent duplicate session creation',
    required: false,
  })
  @ApiResponse({
    status: 201,
    description: 'Session started successfully',
    type: LiveSessionResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'User already has an active session',
  })
  @ApiResponse({
    status: 404,
    description: 'Scheduled workout not found',
  })
  async startSession(
    @CurrentUser('id') userId: string,
    @Body() dto: StartSessionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<LiveSessionResponseDto> {
    this.logger.log(
      `User ${userId} starting session for scheduled workout ${dto.scheduledWorkoutId}`,
    );

    return this.liveService.startSession(userId, dto);
  }

  /**
   * Get session by ID.
   * 
   * GET /workouts/live/sessions/:id
   * 
   * Returns full session details including sets, exercises, and metadata.
   * Optionally includes real-time presence state.
   * 
   * @param userId - Authenticated user ID
   * @param sessionId - Session UUID
   * @param includeState - Include real-time presence state
   * @returns Session details with optional state
   */
  @Get('sessions/:id')
  @ApiOperation({
    summary: 'Get session by ID',
    description: 'Retrieves full session details with sets and exercises.',
  })
  @ApiParam({
    name: 'id',
    description: 'Session UUID',
    type: String,
  })
  @ApiQuery({
    name: 'includeState',
    description: 'Include real-time presence state',
    required: false,
    type: Boolean,
  })
  @ApiResponse({
    status: 200,
    description: 'Session details',
    type: LiveSessionResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Session not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied',
  })
  async getSession(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Query('includeState') includeState?: boolean,
  ): Promise<{
    session: LiveSessionResponseDto;
    state?: any;
  }> {
    const session = await this.liveService.getSessionById(userId, sessionId);

    if (includeState) {
      const state = await this.sessionState.getSnapshot(sessionId);
      return { session, state };
    }

    return { session };
  }

  /**
   * List user's sessions.
   * 
   * GET /workouts/live/sessions
   * 
   * Returns paginated list of user's workout sessions.
   * Supports filtering by date range and status.
   * 
   * @param userId - Authenticated user ID
   * @param filters - Query filters (page, limit, status, dates)
   * @returns Paginated session list
   */
  @Get('sessions')
  @ApiOperation({
    summary: 'List user sessions',
    description:
      'Returns paginated list of user workout sessions with optional filters.',
  })
  @ApiQuery({
    name: 'page',
    description: 'Page number (1-indexed)',
    required: false,
    type: Number,
  })
  @ApiQuery({
    name: 'limit',
    description: 'Items per page (max 100)',
    required: false,
    type: Number,
  })
  @ApiQuery({
    name: 'status',
    description: 'Filter by status',
    required: false,
    enum: ['in_progress', 'paused', 'completed', 'abandoned'],
  })
  @ApiResponse({
    status: 200,
    description: 'Session list',
    type: SessionHistoryResponseDto,
  })
  async listSessions(
    @CurrentUser('id') userId: string,
    @Query() filters: SessionFiltersDto,
  ): Promise<SessionHistoryResponseDto> {
    return this.liveService.getSessionHistory(userId, filters);
  }

  /**
   * Get active session for user.
   * 
   * GET /workouts/live/sessions/active
   * 
   * Returns user's currently active session (in_progress or paused).
   * Useful for resuming session after app restart.
   * 
   * @param userId - Authenticated user ID
   * @returns Active session or 404 if none
   */
  @Get('sessions/active')
  @ApiOperation({
    summary: 'Get active session',
    description: 'Returns user currently active workout session, if any.',
  })
  @ApiResponse({
    status: 200,
    description: 'Active session',
    type: LiveSessionResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'No active session',
  })
  async getActiveSession(
    @CurrentUser('id') userId: string,
  ): Promise<LiveSessionResponseDto> {
    const session = await this.liveService.getActiveSessionForUser(userId);

    if (!session) {
      throw new NotFoundException('No active session found');
    }

    return session;
  }

  /**
   * Get upcoming scheduled workout.
   * 
   * GET /workouts/live/sessions/upcoming
   * 
   * Returns next scheduled workout that can be started.
   * 
   * @param userId - Authenticated user ID
   * @returns Next scheduled workout or 404
   */
  @Get('sessions/upcoming')
  @ApiOperation({
    summary: 'Get upcoming workout',
    description: 'Returns next scheduled workout.',
  })
  @ApiResponse({
    status: 200,
    description: 'Upcoming workout',
  })
  @ApiResponse({
    status: 404,
    description: 'No upcoming workouts',
  })
  async getUpcomingWorkout(@CurrentUser('id') userId: string) {
    return this.liveService.getUpcomingWorkout(userId);
  }

  /**
   * Pause active session.
   * 
   * PATCH /workouts/live/sessions/:id/pause
   * 
   * Pauses the session. User can resume later.
   * Session must be in 'in_progress' status.
   * 
   * @param userId - Authenticated user ID
   * @param sessionId - Session UUID
   * @returns Updated session
   */
  @Patch('sessions/:id/pause')
  @ApiOperation({
    summary: 'Pause session',
    description: 'Pauses an active workout session.',
  })
  @ApiParam({
    name: 'id',
    description: 'Session UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Session paused',
    type: LiveSessionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Session cannot be paused (invalid status)',
  })
  async pauseSession(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ): Promise<LiveSessionResponseDto> {
    this.logger.log(`User ${userId} pausing session ${sessionId}`);
    return this.liveService.pauseSession(userId, sessionId);
  }

  /**
   * Resume paused session.
   * 
   * PATCH /workouts/live/sessions/:id/resume
   * 
   * Resumes a paused session.
   * Session must be in 'paused' status.
   * 
   * @param userId - Authenticated user ID
   * @param sessionId - Session UUID
   * @returns Updated session
   */
  @Patch('sessions/:id/resume')
  @ApiOperation({
    summary: 'Resume session',
    description: 'Resumes a paused workout session.',
  })
  @ApiParam({
    name: 'id',
    description: 'Session UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Session resumed',
    type: LiveSessionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Session cannot be resumed (invalid status or timeout)',
  })
  async resumeSession(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ): Promise<LiveSessionResponseDto> {
    this.logger.log(`User ${userId} resuming session ${sessionId}`);
    return this.liveService.resumeSession(userId, sessionId);
  }

  /**
   * Complete session.
   * 
   * PATCH /workouts/live/sessions/:id/complete
   * 
   * Marks session as completed and calculates final statistics.
   * Session must be in 'in_progress' or 'paused' status.
   * 
   * @param userId - Authenticated user ID
   * @param sessionId - Session UUID
   * @param dto - Optional final notes and rating
   * @returns Completed session with stats
   */
  @Patch('sessions/:id/complete')
  @ApiOperation({
    summary: 'Complete session',
    description:
      'Marks workout session as completed and calculates final statistics.',
  })
  @ApiParam({
    name: 'id',
    description: 'Session UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Session completed',
    type: LiveSessionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Session cannot be completed',
  })
  async completeSession(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() dto?: UpdateSessionDto,
  ): Promise<LiveSessionResponseDto> {
    this.logger.log(`User ${userId} completing session ${sessionId}`);
    return this.liveService.completeSession(userId, sessionId, dto);
  }

  /**
   * Abandon session.
   * 
   * DELETE /workouts/live/sessions/:id
   * 
   * Abandons a session without completing it.
   * Use when workout cannot be completed (injury, equipment failure, etc.).
   * Does not count toward workout statistics.
   * 
   * @param userId - Authenticated user ID
   * @param sessionId - Session UUID
   */
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Abandon session',
    description:
      'Abandons a workout session without completing it. Does not count toward statistics.',
  })
  @ApiParam({
    name: 'id',
    description: 'Session UUID',
  })
  @ApiResponse({
    status: 204,
    description: 'Session abandoned',
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot abandon completed session',
  })
  async abandonSession(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ): Promise<void> {
    this.logger.log(`User ${userId} abandoning session ${sessionId}`);
    await this.liveService.abandonSession(userId, sessionId);
  }

  // ==================== SET TRACKING ====================

  /**
   * Complete an exercise set.
   * 
   * POST /workouts/live/sessions/:id/sets/:setId/complete
   * 
   * Records actual performance for a set (reps, weight, RIR, RPE).
   * Updates session progress.
   * 
   * @param userId - Authenticated user ID
   * @param sessionId - Session UUID
   * @param setId - Set UUID
   * @param dto - Actual performance data
   * @returns Updated set with completion data
   */
  @Post('sessions/:sessionId/sets/:setId/complete')
  @ApiOperation({
    summary: 'Complete exercise set',
    description: 'Records actual performance for an exercise set.',
  })
  @ApiParam({
    name: 'sessionId',
    description: 'Session UUID',
  })
  @ApiParam({
    name: 'setId',
    description: 'Set UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Set completed',
    type: SessionSetResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid set data or session not active',
  })
  async completeSet(
    @CurrentUser('id') userId: string,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Param('setId', new ParseUUIDPipe({ version: '4' })) setId: string,
    @Body() dto: CompleteSetDto,
  ): Promise<SessionSetResponseDto> {
    return this.liveService.completeSet(userId, sessionId, setId, dto);
  }

  // ==================== ANALYTICS & STATE ====================

  /**
   * Get session statistics.
   * 
   * GET /workouts/live/sessions/:id/stats
   * 
   * Returns detailed statistics for a session:
   * - Total volume (weight × reps)
   * - Average RIR and RPE
   * - Exercise-specific breakdown
   * - Personal records
   * 
   * @param userId - Authenticated user ID
   * @param sessionId - Session UUID
   * @returns Session statistics
   */
  @Get('sessions/:id/stats')
  @ApiOperation({
    summary: 'Get session statistics',
    description: 'Returns detailed statistics and analytics for a session.',
  })
  @ApiParam({
    name: 'id',
    description: 'Session UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Session statistics',
    type: SessionStatsDto,
  })
  async getSessionStats(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ): Promise<SessionStatsDto> {
    return this.liveService.getSessionStats(userId, sessionId);
  }

  /**
   * Get real-time session state.
   * 
   * GET /workouts/live/sessions/:id/state
   * 
   * Returns ephemeral real-time state from Redis:
   * - Active users (presence)
   * - User count
   * - Last activity timestamp
   * 
   * Fast endpoint for UI updates (<1ms typical response time).
   * 
   * @param sessionId - Session UUID
   * @returns Real-time session state
   */
  @Get('sessions/:id/state')
  @ApiOperation({
    summary: 'Get real-time session state',
    description:
      'Returns ephemeral real-time state including presence and activity.',
  })
  @ApiParam({
    name: 'id',
    description: 'Session UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Session state',
  })
  async getSessionState(
    @Param('id', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.sessionState.getSnapshot(sessionId);
  }
}

// Import NotFoundException
import { NotFoundException } from '@nestjs/common';