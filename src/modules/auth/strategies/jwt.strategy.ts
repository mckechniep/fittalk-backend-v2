import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
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
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const supabaseUrl = configService.get<string>('supabase.url');
    const jwtSecret = configService.get<string>('supabase.jwtSecret');

    if (!jwtSecret) {
      throw new Error('SUPABASE_JWT_SECRET environment variable is required');
    }

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL environment variable is required');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
      issuer: `${supabaseUrl}/auth/v1`,
      audience: 'authenticated',
      algorithms: ['HS256'],
    });

    this.logger.log('JWT Strategy initialized successfully');
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    this.logger.debug(`JWT validation started for user: ${payload.sub}`);

    if (payload.exp && Date.now() >= payload.exp * 1000) {
      this.logger.warn(`Token expired for user: ${payload.sub}`);
      throw new UnauthorizedException('Token expired');
    }

    const sessionId = payload.session_id;
    const sessionTrackingEnabled = this.configService.get<boolean>(
      'app.trackSessions',
      true,
    );

    // FIRST: Check if user exists, create if not
    let user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        profile: true,
        preferences: true,
      },
    });

    if (!user) {
      this.logger.log(`Creating new user: ${payload.sub}`);
      user = await this.prisma.user.create({
        data: {
          id: payload.sub,
          email: payload.email || '',
          phone: payload.phone,
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
    } else {
      this.logger.debug(`Existing user found: ${user.email}`);
    }

    // THEN: Handle session (now user definitely exists)
    if (sessionId && sessionTrackingEnabled) {
      const session = await this.prisma.session.findUnique({
        where: { jwtId: sessionId },
      });

      if (!session) {
        this.logger.debug(`Creating new session for user: ${payload.sub}`);
        await this.prisma.session.create({
          data: {
            userId: payload.sub, // Now this userId exists!
            jwtId: sessionId,
            expiresAt: new Date((payload.exp ?? 0) * 1000),
          },
        });
      } else if (session.expiresAt < new Date()) {
        throw new UnauthorizedException('Session expired');
      } else {
        this.logger.debug('Session valid');
      }
    }

    // Check if user is suspended
    if (user.suspendedAt) {
      this.logger.warn(`Access denied for suspended user: ${user.id}`);
      throw new UnauthorizedException({
        message: 'Account suspended',
        error: 'AccountSuspended',
        reason: user.suspendedReason,
      });
    }

    this.logger.debug('JWT validation successful');

    // Use role from database (source of truth) instead of JWT
    // JWT role is only used for backwards compatibility
    return {
      id: user.id,
      email: user.email,
      phone: user.phone || undefined,
      role: user.role, // Use role from database
      sessionId: sessionId,
      metadata: {
        ...payload.user_metadata,
        hasProfile: !!user.profile,
      },
    };
  }
}
