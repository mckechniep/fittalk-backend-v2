import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';

/**
 * Authenticated Socket with user data
 */
export interface AuthenticatedSocket extends Socket {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

/**
 * WebSocket JWT Authentication Guard
 *
 * Validates JWT tokens sent via WebSocket handshake auth.
 * Extracts user from token and attaches to socket.
 *
 * Usage in Gateway:
 * @UseGuards(WsJwtAuthGuard)
 * export class LiveGateway { ... }
 *
 * Client-side connection:
 * io('http://localhost:3000/live', {
 *   auth: { token: 'jwt-token-here' }
 * })
 */
@Injectable()
export class WsJwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtAuthGuard.name);

  constructor(private readonly configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client: Socket = context.switchToWs().getClient();
      const token = this.extractToken(client);

      if (!token) {
        this.logger.warn(`No token provided for socket ${client.id}`);
        throw new WsException('Unauthorized: No token provided');
      }

      // Verify JWT using Supabase JWT secret
      const user = await this.verifyToken(token);

      if (!user) {
        this.logger.warn(`Invalid token for socket ${client.id}`);
        throw new WsException('Unauthorized: Invalid token');
      }

      // Attach user to socket for use in handlers
      (client as AuthenticatedSocket).user = user;

      this.logger.log(`WebSocket authenticated: ${client.id} (user: ${user.id})`);

      return true;
    } catch (error) {
      this.logger.error(`WebSocket auth failed: ${error.message}`);
      throw new WsException('Unauthorized');
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
   * Verify JWT token using Supabase secret
   */
  private async verifyToken(token: string): Promise<any> {
    try {
      const jwt = require('jsonwebtoken');
      const jwtSecret = this.configService.get<string>('supabase.jwtSecret');

      if (!jwtSecret) {
        throw new Error('SUPABASE_JWT_SECRET not configured');
      }

      // Verify token
      const payload = jwt.verify(token, jwtSecret, {
        algorithms: ['HS256'],
        issuer: `${this.configService.get<string>('supabase.url')}/auth/v1`,
        audience: 'authenticated',
      });

      // Extract user info
      return {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      };
    } catch (error) {
      this.logger.error(`Token verification failed: ${error.message}`);
      return null;
    }
  }
}
