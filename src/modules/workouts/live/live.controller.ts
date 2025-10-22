// live/live.controller.ts
import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
  Headers,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { LiveService } from './live.service';
import { SessionStateService } from './session-state.service';

// DTOs (place these in ./dto/* to match your structure)
import { CreateLiveSessionDto } from './dto/create-live-session.dto';
import { JoinSessionDto } from './dto/join-session.dto';
import { LiveEventDto } from './dto/live-event.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

@UseGuards(JwtAuthGuard)
@Controller('workouts/live')
export class LiveController {
  constructor(
    private readonly liveService: LiveService,
    private readonly sessionStateService: SessionStateService,
  ) {}

  /**
   * POST /workouts/live/sessions
   *
   * Create a live workout session for the current user (host).
   * Idempotent via optional Idempotency-Key header to avoid duplicate creations.
   *
   * Body: CreateLiveSessionDto
   * Headers (optional): Idempotency-Key
   */
  @Post('sessions')
  async createSession(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateLiveSessionDto,
    @Headers('idempotency-key') idemKey?: string,
  ): Promise<{ sessionId: string }> {
    return this.liveService.createSession(userId, dto, { idemKey });
  }

  /**
   * GET /workouts/live/sessions/:id
   *
   * Return session metadata plus a lightweight presence/state snapshot.
   * Combines DB metadata with transient state (Redis/in-memory).
   */
  @Get('sessions/:id')
  async getSession(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ): Promise<{ meta: any; state: any }> {
    const [meta, state] = await Promise.all([
      this.liveService.getSessionOrThrow(userId, sessionId),
      this.sessionStateService.getSnapshot(sessionId),
    ]);
    return { meta, state };
  }

  /**
   * GET /workouts/live/sessions
   *
   * List sessions for the current user.
   * Query: PaginationQueryDto + optional status=active|scheduled|ended
   */
  @Get('sessions')
  async listMySessions(
    @CurrentUser('id') userId: string,
    @Query() pagination: PaginationQueryDto,
    @Query('status') status?: 'active' | 'scheduled' | 'ended',
  ): Promise<{ items: any[]; nextCursor?: string }> {
    return this.liveService.listUserSessions(userId, { status, ...pagination });
  }

  /**
   * POST /workouts/live/sessions/:id/join
   *
   * Join a live session (idempotent; safe to retry with Idempotency-Key).
   * Body: JoinSessionDto
   * Headers (optional): Idempotency-Key
   */
  @Post('sessions/:id/join')
  async joinSession(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Body() dto: JoinSessionDto,
    @Headers('idempotency-key') idemKey?: string,
  ): Promise<{ joined: boolean }> {
    return this.liveService.joinSession(userId, sessionId, dto, { idemKey });
  }
  /**
   * POST /workouts/live/sessions/:id/leave
   *
   * Leave a live session.
   */
  @Post('sessions/:id/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  async leaveSession(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ): Promise<void> {
    await this.liveService.leaveSession(userId, sessionId);
  }

  /**
   * PATCH /workouts/live/sessions/:id/end
   *
   * End a live session (host only).
   */
  @Patch('sessions/:id/end')
  async endSession(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ): Promise<{ ended: boolean }> {
    return this.liveService.endSession(userId, sessionId);
  }

  
}
