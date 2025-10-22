// src/modules/workouts/live/live.controller.ts

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
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

import { LiveService } from './live.service';
import { SessionStateService } from './session-state.service';

import {
  CreateLiveSessionDto,
  JoinSessionDto,
  LiveEventDto,
} from './dtos';
import { PaginationQueryDto } from '../../../common/dto/ppagination-query.dto'; // <- keep using your shared pagination DTO; fix path if needed

type SessionStatus = 'active' | 'scheduled' | 'ended';

@UseGuards(JwtAuthGuard)
@Controller('workouts/live')
export class LiveController {
  constructor(
    private readonly liveService: LiveService,
    private readonly sessionStateService: SessionStateService,
  ) {}

  /**
   * POST /workouts/live/sessions
   * Create a live workout session (host = current user).
   * Optional Idempotency-Key header to guard against duplicate creations.
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
   * Return session metadata + a lightweight presence/state snapshot.
   */
  @Get('sessions/:id')
  async getSession(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ): Promise<{ meta: unknown; state: unknown }> {
    const [meta, state] = await Promise.all([
      this.liveService.getSessionOrThrow(userId, sessionId),
      this.sessionStateService.getSnapshot(sessionId),
    ]);
    return { meta, state };
  }

  /**
   * GET /workouts/live/sessions
   * List sessions for the current user (active first, then recent).
   * Accepts shared pagination + optional status filter.
   */
  @Get('sessions')
  async listMySessions(
    @CurrentUser('id') userId: string,
    @Query() pagination: PaginationQueryDto,
    @Query('status') status?: SessionStatus,
  ): Promise<{ items: Array<{ id: string; title: string; status: SessionStatus; scheduledAt?: string | null; createdAt: string }>; nextCursor?: string }> {
    return this.liveService.listUserSessions(userId, { status, ...pagination });
  }

  /**
   * POST /workouts/live/sessions/:id/join
   * Join a live session (idempotent with Idempotency-Key).
   */
  @Post('sessions/:id/join')
  async joinSession(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() dto: JoinSessionDto,
    @Headers('idempotency-key') idemKey?: string,
  ): Promise<{ joined: true }> {
    return this.liveService.joinSession(userId, sessionId, dto, { idemKey });
  }

  /**
   * POST /workouts/live/sessions/:id/leave
   * Leave a live session. No content on success.
   */
  @Post('sessions/:id/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  async leaveSession(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ): Promise<void> {
    await this.liveService.leaveSession(userId, sessionId);
  }

  /**
   * PATCH /workouts/live/sessions/:id/end
   * End a live session (host only).
   */
  @Patch('sessions/:id/end')
  async endSession(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ): Promise<{ ended: true }> {
    return this.liveService.endSession(userId, sessionId);
  }

  /**
   * DELETE /workouts/live/sessions/:id
   * Cancel a scheduled session (host only). Soft cancel; no body returned.
   */
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelScheduled(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ): Promise<void> {
    await this.liveService.cancelScheduled(userId, sessionId);
  }

  /**
   * POST /workouts/live/sessions/:id/events
   * HTTP fallback/audit path to emit a live event; service persists and
   * your gateway can fan-out. Supports Idempotency-Key for safe retries.
   */
  @Post('sessions/:id/events')
  async emitEvent(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() dto: LiveEventDto,
    @Headers('idempotency-key') idemKey?: string,
  ): Promise<{ accepted: true }> {
    return this.liveService.emitEvent(userId, sessionId, dto, { idemKey });
  }

  /**
   * GET /workouts/live/sessions/:id/state
   * Lightweight presence/state snapshot for fast UI rehydration.
   */
  @Get('sessions/:id/state')
  async getState(
    @Param('id', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ): Promise<unknown> {
    return this.sessionStateService.getSnapshot(sessionId);
  }
}
