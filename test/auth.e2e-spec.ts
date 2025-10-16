/**
 * ============================================================================
 * AUTH E2E TESTING STRATEGY
 * ============================================================================
 * 
 * This file contains AUTOMATED end-to-end tests for the Auth module.
 * These tests are meant to run in CI/CD pipelines and during development.
 * 
 * WHEN TO USE EACH TESTING APPROACH:
 * 
 * 1. **auth.e2e-spec.ts** (THIS FILE) - Automated Jest Tests
 *    - Purpose: Automated testing for CI/CD
 *    - Run with: `pnpm test:e2e`
 *    - Best for: Regression testing, PR checks, automated validation
 *    - Requires: TEST_USER_EMAIL and TEST_USER_PASSWORD in .env.test
 * 
 * 2. **test/auth-manual-test.ts** - JWT Token Generator
 *    - Purpose: Generate a real Supabase JWT for manual testing
 *    - Run with: `pnpm test:auth`
 *    - Best for: Getting a token to use in curl/Postman
 * 
 * 3. **test/test-all-endpoints.sh** - Manual Integration Testing
 *    - Purpose: Quick manual testing of all endpoints with real requests
 *    - Run with: `./test/test-all-endpoints.sh`
 *    - Best for: Manual QA, exploring API responses, debugging
 *    - Requires: JWT_TOKEN environment variable
 * 
 * SETUP INSTRUCTIONS:
 * - Create a test user in Supabase for your test database
 * - Add to .env.test:
 *   TEST_USER_EMAIL=test@fittalk.com
 *   TEST_USER_PASSWORD=TestPassword123!
 * 
 * ============================================================================
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { getTestJWT } from './test-utils';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let testJWT: string | null = null;

  beforeAll(async () => {
    // Try to get a real test JWT if credentials are available
    const testEmail = process.env.TEST_USER_EMAIL;
    const testPassword = process.env.TEST_USER_PASSWORD;

    if (testEmail && testPassword) {
      try {
        testJWT = await getTestJWT(testEmail, testPassword);
        console.log('✅ Test JWT obtained for authenticated tests');
      } catch (error) {
        console.warn('⚠️  Could not get test JWT - authenticated tests will be skipped');
        console.warn('   Set TEST_USER_EMAIL and TEST_USER_PASSWORD in .env.test');
      }
    }
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    // Apply same configuration as main.ts
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    // Apply global prefix like in production
    app.setGlobalPrefix('api/v1', {
      exclude: ['health', 'auth/health'],
    });

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Public Endpoints (No Auth Required)', () => {
    it('/auth/health (GET) - should return health status', () => {
      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/auth/health',
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.payload);
          expect(body).toHaveProperty('status', 'ok');
          expect(body).toHaveProperty('timestamp');
        });
    });
  });

  describe('Protected Endpoints (Auth Required)', () => {
    it('/api/v1/auth/me (GET) - should return 401 without auth', () => {
      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/auth/me',
        })
        .then((result) => {
          expect(result.statusCode).toBe(401);
        });
    });

    it('/api/v1/auth/me (GET) - should return user data with valid JWT', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/auth/me',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const user = JSON.parse(result.payload);
          expect(user).toHaveProperty('id');
          expect(user).toHaveProperty('email');
          expect(user).not.toHaveProperty('passwordHash'); // Should exclude sensitive fields
        });
    });

    it('/api/v1/auth/sessions (GET) - should return user sessions with valid JWT', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/auth/sessions',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const sessions = JSON.parse(result.payload);
          expect(Array.isArray(sessions)).toBe(true);
        });
    });

    it('/api/v1/auth/profile (POST) - should create/update profile with valid JWT', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const profileData = {
        firstname: 'Test',
        lastname: 'User',
        sex: 'male',
        heightCm: 180,
        weightKg: 75.5,
        experienceLevel: 'intermediate',
        goalType: 'muscle_gain',
        unitSystem: 'metric',
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/auth/profile',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: profileData,
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const profile = JSON.parse(result.payload);
          expect(profile).toHaveProperty('firstname', 'Test');
          expect(profile).toHaveProperty('lastname', 'User');
          expect(profile).toHaveProperty('sex', 'male');
        });
    });

    it('/api/v1/auth/devices (POST) - should register device with valid JWT', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const deviceData = {
        platform: 'android',
        deviceId: `test-device-${Date.now()}`,
        pushToken: 'test-fcm-token',
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/auth/devices',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: deviceData,
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const device = JSON.parse(result.payload);
          expect(device).toHaveProperty('platform', 'android');
          expect(device).toHaveProperty('deviceId');
          expect(device).toHaveProperty('pushToken', 'test-fcm-token');
        });
    });
  });
});