// src/modules/auth/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
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
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const supabaseUrl = configService.get<string>('supabase.url');
    const jwtSecret = configService.get<string>('supabase.jwtSecret');

    console.log('🔧 JWT Strategy Initialization:');
    console.log('  SUPABASE_URL:', supabaseUrl);
    console.log('  JWT_SECRET:', jwtSecret ? '✅ Set' : '❌ Missing');
    console.log('  Expected issuer:', `${supabaseUrl}/auth/v1`);
    console.log('  Expected audience:', 'authenticated');

    if (!jwtSecret) {
      throw new Error('SUPABASE_JWT_SECRET environment variable is required');
    }

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL environment variable is required');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret, // Use secret instead of JWKS
      issuer: `${supabaseUrl}/auth/v1`,
      audience: 'authenticated',
      algorithms: ['HS256'], // Supabase uses HS256 with JWT secret
    });

    console.log('✅ JWT Strategy initialized successfully');
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    console.log('🔑 JWT Validation started for user:', payload.sub);
  
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      console.error('❌ Token expired');
      throw new UnauthorizedException('Token expired');
    }
  
    const sessionId = payload.session_id;
    const sessionTrackingEnabled = this.configService.get<boolean>('app.trackSessions', true);
  
    // FIRST: Check if user exists, create if not
    let user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        profile: true,
        preferences: true,
      },
    });
  
    if (!user) {
      console.log('  👤 Creating new user');
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
      console.log('  ✅ Existing user found:', user.email);
    }
  
    // THEN: Handle session (now user definitely exists)
    if (sessionId && sessionTrackingEnabled) {
      const session = await this.prisma.session.findUnique({
        where: { jwtId: sessionId },
      });
  
      if (!session) {
        console.log('  📝 Creating new session');
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
        console.log('  ✅ Session valid');
      }
    }
  
    console.log('✅ JWT validation successful');
  
    return {
      id: user.id,
      email: user.email,
      phone: user.phone || undefined,
      role: payload.role,
      sessionId: sessionId,
      metadata: {
        ...payload.user_metadata,
        hasProfile: !!user.profile,
      },
    };
  }
}