import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { passportJwtSecret } from 'jwks-rsa';
import { PrismaService } from '../../../prisma/prisma.service';

export interface JwtPayload {
  sub: string; // User ID from Supabase
  email?: string;
  phone?: string;
  role?: string;
  app_metadata?: Record<string, any>;
  user_metadata?: Record<string, any>;
  aal?: string;
  amr?: Array<{ method: string; timestamp: number }>;
  session_id?: string;
  exp?: number;
  iat?: number;
  iss?: string;
  aud?: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  phone?: string;
  role?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const supabaseUrl = configService.get<string>('supabase.url');
    const jwksUri = configService.get<string>('supabase.jwksUri');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['RS256'],
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: jwksUri,
      }),
      issuer: `${supabaseUrl}/auth/v1`,
      audience: 'authenticated',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    // Check if token is expired
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      throw new UnauthorizedException('Token expired');
    }

    // Extract session ID from JWT
    const sessionId = payload.session_id;

    // If we're tracking sessions, verify it exists and is valid
    if (sessionId) {
      const session = await this.prisma.session.findUnique({
        where: { jwtId: sessionId },
      });

      if (!session) {
        throw new UnauthorizedException('Session not found');
      }

      if (session.expiresAt < new Date()) {
        throw new UnauthorizedException('Session expired');
      }
    }

    // Auto-create user if doesn't exist (using Supabase Auth as source of truth)
    let user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        profile: true,
        preferences: true,
      },
    });

    if (!user) {
      // Create user with minimal data from JWT
      user = await this.prisma.user.create({
        data: {
          id: payload.sub,
          email: payload.email || '',
          phone: payload.phone,
          // Create default preference
          preferences: {
            create: {
              timezone: 'America/New_York',
              unitSystem: 'metric',
              voiceEnabled: true,
              language: 'en',
              notifPush: true,
              notifEmail: false,
              notifSms: false,
            },
          },
        },
        include: {
          profile: true,
          preferences: true,
        },
      });

      // Create or update session if sessionId exists
      if (sessionId) {
        await this.prisma.session.upsert({
          where: { jwtId: sessionId },
          update: {
            expiresAt: new Date(payload.exp * 1000),
          },
          create: {
            userId: user.id,
            jwtId: sessionId,
            expiresAt: new Date(payload.exp * 1000),
          },
        });
      }
    }

    // Return authenticated user object
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: payload.role,
      sessionId: sessionId,
      metadata: {
        ...payload.user_metadata,
        hasProfile: !!user.profile,
      },
    };
  }
}