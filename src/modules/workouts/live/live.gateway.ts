import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, ValidationPipe } from '@nestjs/common';
import { LiveSessionService } from './live.service';
import { SessionStateService } from './session-state.service';
import { LiveEventDto, JoinSessionDto } from './dtos';
import { createWsSuccess, createWsError } from './dtos/websocket-response.dto';

/**
 * Extract user from socket handshake (attached by auth middleware)
 */
interface AuthenticatedSocket extends Socket {
  user?: {
    id: string;
    email?: string;
  };
}

/**
 * Live Workout Session WebSocket Gateway
 *
 * Provides real-time bidirectional communication for active workout sessions.
 *
 * Namespace: /live
 *
 * Events (Client → Server):
 * - join-session: Join a specific session room
 * - leave-session: Leave a session room
 * - start-exercise: Start a new exercise
 * - complete-set: Complete a set and start rest timer
 * - end-rest: End rest period and continue
 * - pause-session: Pause the session
 * - resume-session: Resume from pause
 * - end-session: Complete the session
 * - emit-event: Broadcast a custom event to all participants
 * - heartbeat: Keep session alive
 * - get-state: Request current session state snapshot
 *
 * Events (Server → Client):
 * - session-joined: Confirmation of joining
 * - session-left: Confirmation of leaving
 * - state-updated: Broadcast state changes to all participants
 * - exercise-started: New exercise began
 * - set-completed: Set finished, rest timer started
 * - rest-ended: Rest period finished
 * - session-paused: Session paused
 * - session-resumed: Session resumed
 * - session-ended: Session completed
 * - event-received: Custom event broadcast
 * - error: Error occurred
 *
 * Room Structure:
 * - session:{sessionId} - All participants in a session
 * - user:{userId} - All sockets for a specific user (multi-device)
 */
@WebSocketGateway({
  namespace: '/live',
  cors: {
    origin: '*', // Configure properly in production
    credentials: true,
  },
})
export class LiveGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(LiveGateway.name);

  constructor(
    private readonly liveService: LiveSessionService,
    private readonly sessionState: SessionStateService,
  ) {}

  /**
   * Gateway initialization
   */
  afterInit() {
    this.logger.log('Live WebSocket Gateway initialized');
  }

  /**
   * Handle client connection
   */
  async handleConnection(client: AuthenticatedSocket) {
    const userId = client.user?.id;

    if (!userId) {
      this.logger.warn(`Unauthenticated connection attempt: ${client.id}`);
      client.disconnect();
      return;
    }

    // Join user-specific room for multi-device sync
    await client.join(`user:${userId}`);

    this.logger.log(`Client connected: ${client.id} (user: ${userId})`);
  }

  /**
   * Handle client disconnection
   */
  async handleDisconnect(client: AuthenticatedSocket) {
    const userId = client.user?.id;
    this.logger.log(`Client disconnected: ${client.id} (user: ${userId})`);
  }

  /**
   * Join a session room
   */
  @SubscribeMessage('join-session')
  async handleJoinSession(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody(new ValidationPipe()) payload: { sessionId: string; options?: JoinSessionDto },
  ) {
    const userId = client.user?.id;

    if (!userId) {
      return createWsError('join-session', 'UNAUTHORIZED', 'User not authenticated');
    }

    try {
      // Verify session exists and user has access
      const session = await this.liveService.getSession(userId, payload.sessionId);

      // Join session room
      await client.join(`session:${payload.sessionId}`);

      // Get current state
      const state = await this.sessionState.getSnapshot(payload.sessionId);

      // Notify user
      client.emit('session-joined', createWsSuccess('session-joined', { session, state }));

      // Notify others in the room
      client.to(`session:${payload.sessionId}`).emit(
        'participant-joined',
        createWsSuccess('participant-joined', {
          userId,
          socketId: client.id,
        }),
      );

      this.logger.log(`User ${userId} joined session ${payload.sessionId}`);

      return createWsSuccess('join-session', { session, state });
    } catch (error) {
      this.logger.error(`Error joining session: ${error}`);
      return createWsError('join-session', 'ERROR', error.message);
    }
  }

  /**
   * Leave a session room
   */
  @SubscribeMessage('leave-session')
  async handleLeaveSession(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { sessionId: string },
  ) {
    const userId = client.user?.id;

    if (!userId) {
      return createWsError('leave-session', 'UNAUTHORIZED', 'User not authenticated');
    }

    try {
      await client.leave(`session:${payload.sessionId}`);

      // Notify others
      client.to(`session:${payload.sessionId}`).emit(
        'participant-left',
        createWsSuccess('participant-left', {
          userId,
          socketId: client.id,
        }),
      );

      this.logger.log(`User ${userId} left session ${payload.sessionId}`);

      return createWsSuccess('leave-session', { sessionId: payload.sessionId });
    } catch (error) {
      this.logger.error(`Error leaving session: ${error}`);
      return createWsError('leave-session', 'ERROR', error.message);
    }
  }

  /**
   * Start an exercise
   */
  @SubscribeMessage('start-exercise')
  async handleStartExercise(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    payload: {
      sessionId: string;
      exerciseId: string;
      exerciseIndex: number;
    },
  ) {
    const userId = client.user?.id;

    if (!userId) {
      return createWsError('start-exercise', 'UNAUTHORIZED', 'User not authenticated');
    }

    try {
      // Verify ownership
      await this.liveService.getSession(userId, payload.sessionId);

      // Update state
      const state = await this.sessionState.startExercise(
        payload.sessionId,
        payload.exerciseId,
        payload.exerciseIndex,
      );

      // Broadcast to all participants
      this.broadcastToSession(payload.sessionId, 'exercise-started', { state });

      this.logger.log(`Exercise started in session ${payload.sessionId}`);

      return createWsSuccess('start-exercise', { state });
    } catch (error) {
      this.logger.error(`Error starting exercise: ${error}`);
      return createWsError('start-exercise', 'ERROR', error.message);
    }
  }

  /**
   * Complete a set and start rest timer
   */
  @SubscribeMessage('complete-set')
  async handleCompleteSet(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { sessionId: string; restDurationMs: number },
  ) {
    const userId = client.user?.id;

    if (!userId) {
      return createWsError('complete-set', 'UNAUTHORIZED', 'User not authenticated');
    }

    try {
      await this.liveService.getSession(userId, payload.sessionId);

      const state = await this.sessionState.completeSet(
        payload.sessionId,
        payload.restDurationMs,
      );

      this.broadcastToSession(payload.sessionId, 'set-completed', { state });

      this.logger.log(`Set completed in session ${payload.sessionId}, rest: ${payload.restDurationMs}ms`);

      return createWsSuccess('complete-set', { state });
    } catch (error) {
      this.logger.error(`Error completing set: ${error}`);
      return createWsError('complete-set', 'ERROR', error.message);
    }
  }

  /**
   * End rest period
   */
  @SubscribeMessage('end-rest')
  async handleEndRest(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { sessionId: string },
  ) {
    const userId = client.user?.id;

    if (!userId) {
      return createWsError('end-rest', 'UNAUTHORIZED', 'User not authenticated');
    }

    try {
      await this.liveService.getSession(userId, payload.sessionId);

      const state = await this.sessionState.endRest(payload.sessionId);

      this.broadcastToSession(payload.sessionId, 'rest-ended', { state });

      this.logger.log(`Rest ended in session ${payload.sessionId}`);

      return createWsSuccess('end-rest', { state });
    } catch (error) {
      this.logger.error(`Error ending rest: ${error}`);
      return createWsError('end-rest', 'ERROR', error.message);
    }
  }

  /**
   * Pause session
   */
  @SubscribeMessage('pause-session')
  async handlePauseSession(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { sessionId: string },
  ) {
    const userId = client.user?.id;

    if (!userId) {
      return createWsError('pause-session', 'UNAUTHORIZED', 'User not authenticated');
    }

    try {
      await this.liveService.getSession(userId, payload.sessionId);

      const state = await this.sessionState.pause(payload.sessionId);

      this.broadcastToSession(payload.sessionId, 'session-paused', { state });

      this.logger.log(`Session ${payload.sessionId} paused`);

      return createWsSuccess('pause-session', { state });
    } catch (error) {
      this.logger.error(`Error pausing session: ${error}`);
      return createWsError('pause-session', 'ERROR', error.message);
    }
  }

  /**
   * Resume session
   */
  @SubscribeMessage('resume-session')
  async handleResumeSession(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { sessionId: string },
  ) {
    const userId = client.user?.id;

    if (!userId) {
      return createWsError('resume-session', 'UNAUTHORIZED', 'User not authenticated');
    }

    try {
      await this.liveService.getSession(userId, payload.sessionId);

      const state = await this.sessionState.resume(payload.sessionId);

      this.broadcastToSession(payload.sessionId, 'session-resumed', { state });

      this.logger.log(`Session ${payload.sessionId} resumed`);

      return createWsSuccess('resume-session', { state });
    } catch (error) {
      this.logger.error(`Error resuming session: ${error}`);
      return createWsError('resume-session', 'ERROR', error.message);
    }
  }

  /**
   * End session
   */
  @SubscribeMessage('end-session')
  async handleEndSession(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { sessionId: string },
  ) {
    const userId = client.user?.id;

    if (!userId) {
      return createWsError('end-session', 'UNAUTHORIZED', 'User not authenticated');
    }

    try {
      const session = await this.liveService.endSession(userId, payload.sessionId);

      this.broadcastToSession(payload.sessionId, 'session-ended', { session });

      this.logger.log(`Session ${payload.sessionId} ended`);

      return createWsSuccess('end-session', { session });
    } catch (error) {
      this.logger.error(`Error ending session: ${error}`);
      return createWsError('end-session', 'ERROR', error.message);
    }
  }

  /**
   * Emit custom event to session
   */
  @SubscribeMessage('emit-event')
  async handleEmitEvent(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody(new ValidationPipe())
    payload: {
      sessionId: string;
      event: LiveEventDto;
    },
  ) {
    const userId = client.user?.id;

    if (!userId) {
      return createWsError('emit-event', 'UNAUTHORIZED', 'User not authenticated');
    }

    try {
      // Verify access
      await this.liveService.getSession(userId, payload.sessionId);

      // Record event in database
      await this.liveService.recordEvent(userId, payload.sessionId, payload.event);

      // Broadcast to all participants
      this.broadcastToSession(payload.sessionId, 'event-received', {
        event: payload.event,
        userId,
      });

      this.logger.debug(`Event ${payload.event.type} emitted in session ${payload.sessionId}`);

      return createWsSuccess('emit-event', { event: payload.event });
    } catch (error) {
      this.logger.error(`Error emitting event: ${error}`);
      return createWsError('emit-event', 'ERROR', error.message);
    }
  }

  /**
   * Heartbeat to keep session alive
   */
  @SubscribeMessage('heartbeat')
  async handleHeartbeat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { sessionId: string },
  ) {
    const userId = client.user?.id;

    if (!userId) {
      return createWsError('heartbeat', 'UNAUTHORIZED', 'User not authenticated');
    }

    try {
      await this.liveService.recordHeartbeat(userId, payload.sessionId);

      return createWsSuccess('heartbeat', { timestamp: Date.now() });
    } catch (error) {
      this.logger.error(`Error recording heartbeat: ${error}`);
      return createWsError('heartbeat', 'ERROR', error.message);
    }
  }

  /**
   * Get current session state snapshot
   */
  @SubscribeMessage('get-state')
  async handleGetState(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { sessionId: string },
  ) {
    const userId = client.user?.id;

    if (!userId) {
      return createWsError('get-state', 'UNAUTHORIZED', 'User not authenticated');
    }

    try {
      await this.liveService.getSession(userId, payload.sessionId);

      const state = await this.sessionState.getSnapshot(payload.sessionId);

      return createWsSuccess('get-state', { state });
    } catch (error) {
      this.logger.error(`Error getting state: ${error}`);
      return createWsError('get-state', 'ERROR', error.message);
    }
  }

  /**
   * Broadcast message to all participants in a session
   */
  private broadcastToSession(sessionId: string, event: string, data: any) {
    this.server.to(`session:${sessionId}`).emit(event, createWsSuccess(event, data));
  }

  /**
   * Send message to specific user across all devices
   */
  private sendToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, createWsSuccess(event, data));
  }
}
