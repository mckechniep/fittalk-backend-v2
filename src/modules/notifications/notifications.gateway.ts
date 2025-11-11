import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
 * Notifications WebSocket Gateway
 *
 * Provides real-time notification delivery to connected clients.
 *
 * Namespace: /notifications
 *
 * Room Structure:
 * - user:{userId} - All sockets for a specific user (multi-device)
 *
 * Events (Server → Client):
 * - notification - Real-time notification delivery
 * - connected - Connection confirmation
 * - error - Error occurred
 *
 * Usage:
 * - Users connect to /notifications namespace
 * - Join their user-specific room automatically
 * - Receive notifications in real-time across all devices
 * - NotificationsService broadcasts to user rooms
 */
@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: '*', // Configure properly in production
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Gateway initialization
   */
  afterInit() {
    this.logger.log('Notifications WebSocket Gateway initialized');
  }

  /**
   * Handle client connection
   */
  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Authenticate the client
      const user = await this.authenticateClient(client);

      if (!user) {
        this.logger.warn(
          `Unauthenticated connection attempt: ${client.id}`,
        );
        client.emit('error', {
          event: 'connection',
          code: 'UNAUTHORIZED',
          message: 'Authentication failed',
        });
        client.disconnect();
        return;
      }

      // Attach user to socket
      client.user = user;

      // Join user-specific room for multi-device sync
      await client.join(`user:${user.id}`);

      this.logger.log(
        `Client connected to notifications: ${client.id} (user: ${user.id})`,
      );

      // Send connection success
      client.emit('connected', {
        event: 'connected',
        success: true,
        data: { userId: user.id, socketId: client.id },
      });
    } catch (error) {
      this.logger.error(`Connection error: ${error.message}`);
      client.emit('error', {
        event: 'connection',
        code: 'ERROR',
        message: error.message,
      });
      client.disconnect();
    }
  }

  /**
   * Handle client disconnection
   */
  async handleDisconnect(client: AuthenticatedSocket) {
    const userId = client.user?.id;
    this.logger.log(
      `Client disconnected from notifications: ${client.id} (user: ${userId})`,
    );
  }

  /**
   * Authenticate WebSocket client using JWT
   */
  private async authenticateClient(
    client: Socket,
  ): Promise<{ id: string; email?: string } | null> {
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
   * Broadcast notification to user across all devices
   *
   * Called by NotificationsService when sending notifications.
   *
   * @param userId - User ID to send to
   * @param notification - Notification data
   */
  broadcastToUser(userId: string, notification: any) {
    const room = `user:${userId}`;
    this.server.to(room).emit('notification', {
      event: 'notification',
      success: true,
      data: notification,
    });

    this.logger.debug(`Broadcasted notification to user ${userId}`);
  }
}