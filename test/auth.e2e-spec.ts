import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AuthController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/auth/health (GET) - should return health status without auth', () => {
    return app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: '/auth/health',
      })
      .then((result) => {
        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.payload)).toHaveProperty('status', 'ok');
      });
  });

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

  it('/api/v1/auth/me (GET) - should return user with valid JWT', async () => {
    // Note: You'll need a valid Supabase JWT for testing
    // You can generate one via Supabase dashboard or use a test user
    const validJwt = 'YOUR_TEST_JWT_HERE';

    if (validJwt === 'YOUR_TEST_JWT_HERE') {
      console.warn('Skipping test - no valid JWT provided');
      return;
    }

    return app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          Authorization: `Bearer ${validJwt}`,
        },
      })
      .then((result) => {
        expect(result.statusCode).toBe(200);
        const user = JSON.parse(result.payload);
        expect(user).toHaveProperty('id');
        expect(user).toHaveProperty('email');
      });
  });
});