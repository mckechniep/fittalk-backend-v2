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
import { ConfigService } from '@nestjs/config';
import { LiveSessionService } from './live.service';
import { SessionStateService } from './session-state.service';
import { LiveEventDto } from './dtos';
import { createWsSuccess, createWsError } from './dtos/websocket-response.dto';
import { WebSocketRateLimiterService } from '../../../common/guards/throttler/websocket-rate-limiter.service';
import { RATE_LIMITS } from '../../../common/guards/throttler/throttler.config';

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
    private readonly configService: ConfigService,
    private readonly wsRateLimiter: WebSocketRateLimiterService,
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
    try {
      // Authenticate the client
      const user = await this.authenticateClient(client);

      if (!user) {
        this.logger.warn(`Unauthenticated connection attempt: ${client.id}`);
        client.emit('error', createWsError('connection', 'UNAUTHORIZED', 'Authentication failed'));
        client.disconnect();
        return;
      }

      // Attach user to socket
      client.user = user;

      // Join user-specific room for multi-device sync
      await client.join(`user:${user.id}`);

      this.logger.log(`Client connected: ${client.id} (user: ${user.id})`);

      // Send connection success
      client.emit('connected', createWsSuccess('connected', { userId: user.id, socketId: client.id }));
    } catch (error) {
      this.logger.error(`Connection error: ${error.message}`);
      client.emit('error', createWsError('connection', 'ERROR', error.message));
      client.disconnect();
    }
  }

  /**
   * Authenticate WebSocket client using JWT
   */
  private async authenticateClient(client: Socket): Promise<{ id: string; email?: string } | null> {
    try {
      const token = this.extractToken(client);

      if (!token) {
        return null;
      }

      // Verify JWT using Supabase secret
      const jwt = require('jsonwebtoken');
      const jwtSecret = this.configService.get<string>('supabase.jwtSecret');
      const supabaseUrl = this.configService.get<string>('supabase.url');

      if (!jwtSecret) {
        this.logger.error('SUPABASE_JWT_SECRET not configured');
        return null;
      }

      const payload = jwt.verify(token, jwtSecret, {
        algorithms: ['HS256'],
        issuer: `${supabaseUrl}/auth/v1`,
        audience: 'authenticated',
      });

      return {
        id: payload.sub,
        email: payload.email,
      };
    } catch (error) {
      this.logger.error(`Token verification failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract JWT token from socket handshake
   */
  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth;
    const query = client.handshake.query;

    // Try auth.token first (recommended)
    if (auth && auth.token) {
      return auth.token;
    }

    // Fallback to query parameter
    if (query && query.token) {
      return Array.isArray(query.token) ? query.token[0] : query.token;
    }

    // Try Authorization header
    const authHeader = client.handshake.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
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
    @MessageBody() payload: { sessionId: string },
  ) {
    const userId = client.user?.id;

    if (!userId) {
      return createWsError('join-session', 'UNAUTHORIZED', 'User not authenticated');
    }

    // Rate limiting check
    const allowed = await this.wsRateLimiter.checkLimit(
      userId,
      'join-session',
      RATE_LIMITS.WS_SESSION_JOIN,
    );

    if (!allowed) {
      return this.createRateLimitError('join-session', RATE_LIMITS.WS_SESSION_JOIN);
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

    // Rate limiting check
    const allowed = await this.wsRateLimiter.checkLimit(
      userId,
      'leave-session',
      RATE_LIMITS.WS_SESSION_LEAVE,
    );

    if (!allowed) {
      return this.createRateLimitError('leave-session', RATE_LIMITS.WS_SESSION_LEAVE);
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

    // Rate limiting check
    const allowed = await this.wsRateLimiter.checkLimit(
      userId,
      'start-exercise',
      RATE_LIMITS.WS_START_EXERCISE,
    );

    if (!allowed) {
      return this.createRateLimitError('start-exercise', RATE_LIMITS.WS_START_EXERCISE);
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

    // Rate limiting check
    const allowed = await this.wsRateLimiter.checkLimit(
      userId,
      'complete-set',
      RATE_LIMITS.WS_COMPLETE_SET,
    );

    if (!allowed) {
      return this.createRateLimitError('complete-set', RATE_LIMITS.WS_COMPLETE_SET);
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

    // Rate limiting check
    const allowed = await this.wsRateLimiter.checkLimit(
      userId,
      'end-rest',
      RATE_LIMITS.WS_END_REST,
    );

    if (!allowed) {
      return this.createRateLimitError('end-rest', RATE_LIMITS.WS_END_REST);
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

    // Rate limiting check
    const allowed = await this.wsRateLimiter.checkLimit(
      userId,
      'pause-session',
      RATE_LIMITS.WS_PAUSE_SESSION,
    );

    if (!allowed) {
      return this.createRateLimitError('pause-session', RATE_LIMITS.WS_PAUSE_SESSION);
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

    // Rate limiting check
    const allowed = await this.wsRateLimiter.checkLimit(
      userId,
      'resume-session',
      RATE_LIMITS.WS_RESUME_SESSION,
    );

    if (!allowed) {
      return this.createRateLimitError('resume-session', RATE_LIMITS.WS_RESUME_SESSION);
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

    // Rate limiting check
    const allowed = await this.wsRateLimiter.checkLimit(
      userId,
      'end-session',
      RATE_LIMITS.WS_END_SESSION,
    );

    if (!allowed) {
      return this.createRateLimitError('end-session', RATE_LIMITS.WS_END_SESSION);
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

    // Rate limiting check
    const allowed = await this.wsRateLimiter.checkLimit(
      userId,
      'emit-event',
      RATE_LIMITS.WS_EMIT_EVENT,
    );

    if (!allowed) {
      return this.createRateLimitError('emit-event', RATE_LIMITS.WS_EMIT_EVENT);
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

    // Rate limiting check
    const allowed = await this.wsRateLimiter.checkLimit(
      userId,
      'heartbeat',
      RATE_LIMITS.WS_HEARTBEAT,
    );

    if (!allowed) {
      return this.createRateLimitError('heartbeat', RATE_LIMITS.WS_HEARTBEAT);
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

    // Rate limiting check
    const allowed = await this.wsRateLimiter.checkLimit(
      userId,
      'get-state',
      RATE_LIMITS.WS_GET_STATE,
    );

    if (!allowed) {
      return this.createRateLimitError('get-state', RATE_LIMITS.WS_GET_STATE);
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

  /**
   * Create rate limit exceeded error with metadata
   */
  private createRateLimitError(
    eventName: string,
    config: { ttl: number; limit: number },
  ) {
    const retryAfterSeconds = Math.ceil(config.ttl / 1000);
    return createWsError(
      eventName,
      'RATE_LIMIT_EXCEEDED',
      'Too many requests. Please try again in a few seconds.',
      {
        retryAfter: retryAfterSeconds,
        limit: config.limit,
        windowMs: config.ttl,
        resetAt: Date.now() + config.ttl,
      },
    );
  }
}
