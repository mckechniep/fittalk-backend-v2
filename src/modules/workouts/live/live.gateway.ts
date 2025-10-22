// src/modules/workouts/live/live.gateway.ts

import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { UseGuards, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentWsUser } from '../../../common/decorators/current-ws-user.decorator';
import { SessionStateService } from './session-state.service';
import { LiveEventDto } from './dtos';

/**
 * Socket.IO gateway for Live sessions.
 * Realtime UX lives here (rooms, presence, ephemeral events).
 * Durable audit/persistence should happen via HTTP/controller + service.
 */
@WebSocketGateway({
  namespace: '/workouts/live',
  cors: { origin: true, credentials: true },
})
@UseGuards(JwtAuthGuard)
export class LiveGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  private readonly logger = new Logger(LiveGateway.name);

  constructor(private readonly sessionState: SessionStateService) {}

  // ---- Lifecycle ------------------------------------------------------------

  async handleConnection(client: Socket) {
    // JwtWsGuard should attach the authenticated user to client.data.user
    const user = client.data?.user;
    if (!user?.id) {
      this.logger.warn('WS connection without user; disconnecting');
      client.disconnect(true);
      return;
    }
    this.logger.debug(`WS connected: ${user.id}`);
  }

  async handleDisconnect(client: Socket) {
    const userId: string | undefined = client.data?.user?.id;
    const sessionId: string | undefined = client.data?.sessionId;
    if (userId && sessionId) {
      this.sessionState.leave(sessionId, userId);
      this.server.to(sessionId).emit('presence.update', this.sessionState.getSnapshot(sessionId));
    }
  }

  // ---- Helpers --------------------------------------------------------------

  /** UUID v4 light check to keep rooms sane (avoid joining arbitrary strings). */
  private isUuidV4(s?: string): s is string {
    return !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
  }

  private emitPresence(sessionId: string) {
    this.server.to(sessionId).emit('presence.update', this.sessionState.getSnapshot(sessionId));
  }

  // ---- Message Handlers -----------------------------------------------------

  /**
   * Client joins a session room and becomes visible in presence.
   * payload: { sessionId: string; displayName?: string; role?: string }
   */
  @SubscribeMessage('session.join')
  async onSessionJoin(
    @ConnectedSocket() client: Socket,
    @CurrentWsUser('id') userId: string,
    @MessageBody() payload: { sessionId?: string; displayName?: string; role?: string },
  ) {
    const sessionId = payload?.sessionId?.trim();
    if (!this.isUuidV4(sessionId)) return { ok: false, error: 'invalid sessionId' };

    // Bind client to room
    client.join(sessionId);
    client.data.sessionId = sessionId;

    // Update presence
    this.sessionState.join(sessionId, userId, { name: payload?.displayName, role: payload?.role });
    this.emitPresence(sessionId);

    return { ok: true };
  }

  /**
   * Client leaves current session room and presence.
   * payload: none (room inferred from client.data.sessionId)
   */
  @SubscribeMessage('session.leave')
  async onSessionLeave(
    @ConnectedSocket() client: Socket,
    @CurrentWsUser('id') userId: string,
  ) {
    const sessionId: string | undefined = client.data?.sessionId;
    if (!this.isUuidV4(sessionId)) return { ok: true }; // nothing to do

    client.leave(sessionId);
    client.data.sessionId = undefined;

    this.sessionState.leave(sessionId, userId);
    this.emitPresence(sessionId);

    return { ok: true };
  }

  /**
   * Heartbeat/ping to keep presence fresh (optional from client every ~30s).
   * payload: none (session inferred).
   */
  @SubscribeMessage('session.heartbeat')
  async onSessionHeartbeat(
    @ConnectedSocket() client: Socket,
    @CurrentWsUser('id') userId: string,
  ) {
    const sessionId: string | undefined = client.data?.sessionId;
    if (!this.isUuidV4(sessionId)) return { ok: false, error: 'not in a session' };

    this.sessionState.upsertUser(sessionId, userId, {});
    this.emitPresence(sessionId);

    return { ok: true };
  }

  /**
   * Emit a realtime event to everyone in the room (ephemeral).
   * payload: { sessionId: string } & LiveEventDto
   * Note: durable/audit path should be the HTTP controller (`POST /events`).
   */
  @SubscribeMessage('event.emit')
  async onEventEmit(
    @ConnectedSocket() client: Socket,
    @CurrentWsUser('id') userId: string,
    @MessageBody() body: { sessionId?: string } & LiveEventDto,
  ) {
    const sessionId = body?.sessionId?.trim();
    if (!this.isUuidV4(sessionId)) return { ok: false, error: 'invalid sessionId' };

    // Require client to be joined to the room it’s emitting to
    if (client.data?.sessionId !== sessionId) {
      return { ok: false, error: 'join session first' };
    }

    // Broadcast enriched event (actor + timestamp)
    const enriched = { ...body, actorId: userId, at: Date.now() };
    this.server.to(sessionId).emit('event', enriched);

    // Presence heartbeat piggyback
    this.sessionState.upsertUser(sessionId, userId, {});
    this.emitPresence(sessionId);

    return { ok: true };
  }
}
