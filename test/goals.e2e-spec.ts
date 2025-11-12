/**
 * ============================================================================
 * COMPREHENSIVE GOALS MODULE E2E TESTS
 * ============================================================================
 *
 * This test suite provides comprehensive coverage for goals management:
 * ✅ Goal creation with various data combinations
 * ✅ Goal progress tracking (listing, filtering, details)
 * ✅ Goal completion (status transitions)
 * ✅ Goal history (viewing past goals)
 * ✅ Weight tracking for goals
 * ✅ Target date management
 * ✅ Goal updates and deletions
 * ✅ Data validation and edge cases
 *
 * SETUP INSTRUCTIONS:
 * - Create a test user in Supabase for your test database
 * - Add to .env.test:
 *   TEST_USER_EMAIL=test@fittalk.com
 *   TEST_USER_PASSWORD=TestPassword123!
 *
 * RUN TESTS:
 * - pnpm test:e2e test/goals.e2e-spec.ts
 *
 * ============================================================================
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { getTestJWT } from './test-utils';

describe('Goals Module (e2e)', () => {
  let app: INestApplication;
  let testJWT: string | null = null;
  let testUserId: string | null = null;
  let createdGoalId: string | null = null;

  beforeAll(async () => {
    // Try to get a real test JWT if credentials are available
    const testEmail = process.env.TEST_USER_EMAIL;
    const testPassword = process.env.TEST_USER_PASSWORD;

    if (testEmail && testPassword) {
      try {
        testJWT = await getTestJWT(testEmail, testPassword);

        // Extract user ID from JWT
        const payload = JSON.parse(
          Buffer.from(testJWT.split('.')[1], 'base64').toString(),
        );
        testUserId = payload.sub;

        console.log('✅ Test JWT obtained for goals tests');
        console.log(`   User ID: ${testUserId}`);
      } catch (error) {
        console.warn(
          '⚠️  Could not get test JWT - goals tests will be skipped',
        );
        console.warn(
          '   Set TEST_USER_EMAIL and TEST_USER_PASSWORD in .env.test',
        );
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

    app.setGlobalPrefix('api/v1', {
      exclude: ['health', 'auth/health'],
    });

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  // ============================================================================
  // GOAL CREATION
  // ============================================================================

  describe('Goal Creation', () => {
    it('POST /api/v1/goals - should create goal with minimal required data (type only)', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const minimalGoal = {
        type: 'fat_loss',
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/goals',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: minimalGoal,
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const goal = JSON.parse(result.payload);

          expect(goal).toHaveProperty('id');
          expect(goal).toHaveProperty('userId', testUserId);
          expect(goal).toHaveProperty('type', 'fat_loss');
          expect(goal).toHaveProperty('status', 'active');
          expect(goal).toHaveProperty('createdAt');
          expect(goal).toHaveProperty('updatedAt');

          // Store for later tests
          createdGoalId = goal.id;
        });
    });

    it('POST /api/v1/goals - should create goal with complete data', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const completeGoal = {
        type: 'muscle_gain',
        description: 'Gain 5kg of muscle mass by summer',
        targetDate: '2025-06-01T00:00:00.000Z',
        startWeightKg: 75.5,
        targetWeightKg: 80.5,
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/goals',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: completeGoal,
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const goal = JSON.parse(result.payload);

          expect(goal).toHaveProperty('type', 'muscle_gain');
          expect(goal).toHaveProperty('description', 'Gain 5kg of muscle mass by summer');
          expect(goal).toHaveProperty('targetDate');
          expect(goal).toHaveProperty('startWeightKg', '75.5');
          expect(goal).toHaveProperty('targetWeightKg', '80.5');
          expect(goal).toHaveProperty('status', 'active');
        });
    });

    it('POST /api/v1/goals - should create performance goal without weight tracking', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const performanceGoal = {
        type: 'performance',
        description: 'Run a 5K in under 25 minutes',
        targetDate: '2025-07-01T00:00:00.000Z',
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/goals',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: performanceGoal,
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const goal = JSON.parse(result.payload);

          expect(goal).toHaveProperty('type', 'performance');
          expect(goal).toHaveProperty('description', 'Run a 5K in under 25 minutes');
          expect(goal).toHaveProperty('startWeightKg', null);
          expect(goal).toHaveProperty('targetWeightKg', null);
        });
    });

    it('POST /api/v1/goals - should create maintenance goal', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const maintenanceGoal = {
        type: 'maintenance',
        description: 'Maintain current fitness level',
        startWeightKg: 70.0,
        targetWeightKg: 70.0,
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/goals',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: maintenanceGoal,
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const goal = JSON.parse(result.payload);

          expect(goal).toHaveProperty('type', 'maintenance');
          expect(goal).toHaveProperty('description', 'Maintain current fitness level');
          expect(goal).toHaveProperty('startWeightKg', '70');
          expect(goal).toHaveProperty('targetWeightKg', '70');
        });
    });

    it('POST /api/v1/goals - should create fat loss goal with weight tracking', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const fatLossGoal = {
        type: 'fat_loss',
        description: 'Lose 10kg for better health',
        targetDate: '2025-12-31T00:00:00.000Z',
        startWeightKg: 85.0,
        targetWeightKg: 75.0,
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/goals',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: fatLossGoal,
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const goal = JSON.parse(result.payload);

          expect(goal).toHaveProperty('type', 'fat_loss');
          expect(goal).toHaveProperty('startWeightKg', '85');
          expect(goal).toHaveProperty('targetWeightKg', '75');

          // Calculate and verify weight difference
          const weightDiff = parseFloat(goal.startWeightKg) - parseFloat(goal.targetWeightKg);
          expect(weightDiff).toBe(10.0);
        });
    });

    it('POST /api/v1/goals - should reject invalid goal type', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const invalidGoal = {
        type: 'invalid_type',
        description: 'This should fail',
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/goals',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: invalidGoal,
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
        });
    });

    it('POST /api/v1/goals - should reject request without authentication', async () => {
      const goal = {
        type: 'fat_loss',
        description: 'This should fail without auth',
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/goals',
          headers: {
            'Content-Type': 'application/json',
          },
          payload: goal,
        })
        .then((result) => {
          expect(result.statusCode).toBe(401);
        });
    });

    it('POST /api/v1/goals - should reject invalid target date format', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const invalidDateGoal = {
        type: 'muscle_gain',
        targetDate: 'invalid-date-format',
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/goals',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: invalidDateGoal,
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
        });
    });

    it('POST /api/v1/goals - should reject invalid weight values', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const invalidWeightGoal = {
        type: 'fat_loss',
        startWeightKg: 'not-a-number',
        targetWeightKg: 75,
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/goals',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: invalidWeightGoal,
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
        });
    });
  });

  // ============================================================================
  // GOAL PROGRESS TRACKING
  // ============================================================================

  describe('Goal Progress Tracking', () => {
    let trackingGoalId: string;
    let pausedGoalId: string;
    let achievedGoalId: string;

    beforeEach(async () => {
      if (!testJWT) return;

      // Create multiple goals with different statuses for tracking tests
      const activeGoal = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/goals',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            type: 'fat_loss',
            description: 'Active weight loss goal',
            startWeightKg: 90,
            targetWeightKg: 80,
          },
        });
      trackingGoalId = JSON.parse(activeGoal.payload).id;

      // Create and pause a goal
      const pausedGoal = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/goals',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            type: 'muscle_gain',
            description: 'Paused muscle gain goal',
          },
        });
      pausedGoalId = JSON.parse(pausedGoal.payload).id;

      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/goals/${pausedGoalId}/status`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: { status: 'paused' },
        });

      // Create and achieve a goal
      const achievedGoal = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/goals',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            type: 'performance',
            description: 'Achieved performance goal',
          },
        });
      achievedGoalId = JSON.parse(achievedGoal.payload).id;

      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/goals/${achievedGoalId}/status`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: { status: 'achieved' },
        });
    });

    it('GET /api/v1/goals - should list all user goals', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/goals',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const goals = JSON.parse(result.payload);

          expect(Array.isArray(goals)).toBe(true);
          expect(goals.length).toBeGreaterThanOrEqual(3);

          // Verify goals are ordered by creation date (newest first)
          if (goals.length > 1) {
            const dates = goals.map((g: any) => new Date(g.createdAt).getTime());
            const sortedDates = [...dates].sort((a, b) => b - a);
            expect(dates).toEqual(sortedDates);
          }
        });
    });

    it('GET /api/v1/goals?status=active - should filter active goals only', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/goals?status=active',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const goals = JSON.parse(result.payload);

          expect(Array.isArray(goals)).toBe(true);
          goals.forEach((goal: any) => {
            expect(goal.status).toBe('active');
          });
        });
    });

    it('GET /api/v1/goals?status=paused - should filter paused goals only', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/goals?status=paused',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const goals = JSON.parse(result.payload);

          expect(Array.isArray(goals)).toBe(true);
          goals.forEach((goal: any) => {
            expect(goal.status).toBe('paused');
          });

          // Should include our paused goal
          const pausedGoal = goals.find((g: any) => g.id === pausedGoalId);
          expect(pausedGoal).toBeDefined();
        });
    });

    it('GET /api/v1/goals?status=achieved - should filter achieved goals only', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/goals?status=achieved',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const goals = JSON.parse(result.payload);

          expect(Array.isArray(goals)).toBe(true);
          goals.forEach((goal: any) => {
            expect(goal.status).toBe('achieved');
          });

          // Should include our achieved goal
          const achievedGoal = goals.find((g: any) => g.id === achievedGoalId);
          expect(achievedGoal).toBeDefined();
        });
    });

    it('GET /api/v1/goals/:id - should get specific goal details', async () => {
      if (!testJWT || !trackingGoalId) {
        console.warn('⏭️  Skipping test - no test JWT or goal ID available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: `/api/v1/goals/${trackingGoalId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const goal = JSON.parse(result.payload);

          expect(goal).toHaveProperty('id', trackingGoalId);
          expect(goal).toHaveProperty('type', 'fat_loss');
          expect(goal).toHaveProperty('description', 'Active weight loss goal');
          expect(goal).toHaveProperty('startWeightKg', '90');
          expect(goal).toHaveProperty('targetWeightKg', '80');
          expect(goal).toHaveProperty('status', 'active');
          expect(goal).toHaveProperty('user');
        });
    });

    it('GET /api/v1/goals/:id - should return 404 for non-existent goal', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const fakeGoalId = '00000000-0000-0000-0000-000000000000';

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: `/api/v1/goals/${fakeGoalId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(404);
          const error = JSON.parse(result.payload);
          expect(error).toHaveProperty('error', 'GoalNotFound');
        });
    });

    it('GET /api/v1/goals/:id - should return 400 for invalid UUID', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/goals/invalid-uuid',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
        });
    });

    it('GET /api/v1/goals - should not return other users goals', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/goals',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const goals = JSON.parse(result.payload);

          // All returned goals should belong to the test user
          goals.forEach((goal: any) => {
            expect(goal.userId || testUserId).toBe(testUserId);
          });
        });
    });
  });

  // ============================================================================
  // GOAL COMPLETION & STATUS TRANSITIONS
  // ============================================================================

  describe('Goal Completion & Status Transitions', () => {
    let statusGoalId: string;

    beforeEach(async () => {
      if (!testJWT) return;

      // Create a fresh goal for status transition tests
      const newGoal = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/goals',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            type: 'fat_loss',
            description: 'Goal for status testing',
            startWeightKg: 85,
            targetWeightKg: 75,
          },
        });
      statusGoalId = JSON.parse(newGoal.payload).id;
    });

    it('PATCH /api/v1/goals/:id/status - should transition active → achieved', async () => {
      if (!testJWT || !statusGoalId) {
        console.warn('⏭️  Skipping test - no test JWT or goal ID available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/goals/${statusGoalId}/status`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: { status: 'achieved' },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const goal = JSON.parse(result.payload);

          expect(goal).toHaveProperty('id', statusGoalId);
          expect(goal).toHaveProperty('status', 'achieved');
        });
    });

    it('PATCH /api/v1/goals/:id/status - should transition active → paused', async () => {
      if (!testJWT || !statusGoalId) {
        console.warn('⏭️  Skipping test - no test JWT or goal ID available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/goals/${statusGoalId}/status`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: { status: 'paused' },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const goal = JSON.parse(result.payload);

          expect(goal).toHaveProperty('status', 'paused');
        });
    });

    it('PATCH /api/v1/goals/:id/status - should transition paused → active', async () => {
      if (!testJWT || !statusGoalId) {
        console.warn('⏭️  Skipping test - no test JWT or goal ID available');
        return;
      }

      // First pause the goal
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/goals/${statusGoalId}/status`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: { status: 'paused' },
        });

      // Then resume it
      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/goals/${statusGoalId}/status`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: { status: 'active' },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const goal = JSON.parse(result.payload);

          expect(goal).toHaveProperty('status', 'active');
        });
    });

    it('PATCH /api/v1/goals/:id/status - should transition active → abandoned', async () => {
      if (!testJWT || !statusGoalId) {
        console.warn('⏭️  Skipping test - no test JWT or goal ID available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/goals/${statusGoalId}/status`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: { status: 'abandoned' },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const goal = JSON.parse(result.payload);

          expect(goal).toHaveProperty('status', 'abandoned');
        });
    });

    it('PATCH /api/v1/goals/:id/status - should transition paused → achieved', async () => {
      if (!testJWT || !statusGoalId) {
        console.warn('⏭️  Skipping test - no test JWT or goal ID available');
        return;
      }

      // First pause the goal
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/goals/${statusGoalId}/status`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: { status: 'paused' },
        });

      // Then mark as achieved
      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/goals/${statusGoalId}/status`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: { status: 'achieved' },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const goal = JSON.parse(result.payload);

          expect(goal).toHaveProperty('status', 'achieved');
        });
    });

    it('PATCH /api/v1/goals/:id/status - should reject invalid status', async () => {
      if (!testJWT || !statusGoalId) {
        console.warn('⏭️  Skipping test - no test JWT or goal ID available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/goals/${statusGoalId}/status`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: { status: 'invalid_status' },
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
        });
    });

    it('PATCH /api/v1/goals/:id/status - should return 404 for non-existent goal', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const fakeGoalId = '00000000-0000-0000-0000-000000000000';

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/goals/${fakeGoalId}/status`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: { status: 'achieved' },
        })
        .then((result) => {
          expect(result.statusCode).toBe(404);
        });
    });
  });

  // ============================================================================
  // GOAL HISTORY
  // ============================================================================

  describe('Goal History', () => {
    beforeEach(async () => {
      if (!testJWT) return;

      // Create goals with different statuses and timestamps
      // These will naturally be ordered by creation time

      const goals = [
        {
          type: 'fat_loss',
          description: 'Completed weight loss from last year',
          startWeightKg: 95,
          targetWeightKg: 85,
        },
        {
          type: 'muscle_gain',
          description: 'Abandoned muscle gain attempt',
          startWeightKg: 70,
          targetWeightKg: 75,
        },
        {
          type: 'performance',
          description: 'Current active running goal',
        },
        {
          type: 'maintenance',
          description: 'Paused maintenance plan',
        },
      ];

      const statuses = ['achieved', 'abandoned', 'active', 'paused'];

      for (let i = 0; i < goals.length; i++) {
        const response = await app
          .getHttpAdapter()
          .getInstance()
          .inject({
            method: 'POST',
            url: '/api/v1/goals',
            headers: {
              Authorization: `Bearer ${testJWT}`,
              'Content-Type': 'application/json',
            },
            payload: goals[i],
          });

        const goalId = JSON.parse(response.payload).id;

        // Update status if not active (default)
        if (statuses[i] !== 'active') {
          await app
            .getHttpAdapter()
            .getInstance()
            .inject({
              method: 'PATCH',
              url: `/api/v1/goals/${goalId}/status`,
              headers: {
                Authorization: `Bearer ${testJWT}`,
                'Content-Type': 'application/json',
              },
              payload: { status: statuses[i] },
            });
        }
      }
    });

    it('GET /api/v1/goals - should retrieve full goal history', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/goals',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const goals = JSON.parse(result.payload);

          expect(Array.isArray(goals)).toBe(true);
          expect(goals.length).toBeGreaterThanOrEqual(4);

          // Should contain goals with all different statuses
          const statuses = goals.map((g: any) => g.status);
          expect(statuses).toContain('active');
          expect(statuses).toContain('achieved');
          expect(statuses).toContain('abandoned');
          expect(statuses).toContain('paused');
        });
    });

    it('GET /api/v1/goals?status=achieved - should show completed goals history', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/goals?status=achieved',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const goals = JSON.parse(result.payload);

          expect(Array.isArray(goals)).toBe(true);
          goals.forEach((goal: any) => {
            expect(goal.status).toBe('achieved');
          });

          // Should include our completed weight loss goal
          const completedGoal = goals.find(
            (g: any) => g.description === 'Completed weight loss from last year',
          );
          expect(completedGoal).toBeDefined();
        });
    });

    it('GET /api/v1/goals?status=abandoned - should show abandoned goals history', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/goals?status=abandoned',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const goals = JSON.parse(result.payload);

          expect(Array.isArray(goals)).toBe(true);
          goals.forEach((goal: any) => {
            expect(goal.status).toBe('abandoned');
          });

          // Should include our abandoned muscle gain goal
          const abandonedGoal = goals.find(
            (g: any) => g.description === 'Abandoned muscle gain attempt',
          );
          expect(abandonedGoal).toBeDefined();
        });
    });

    it('GET /api/v1/goals - should order goals by creation date (newest first)', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/goals',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const goals = JSON.parse(result.payload);

          expect(goals.length).toBeGreaterThanOrEqual(2);

          // Verify descending order by creation date
          for (let i = 0; i < goals.length - 1; i++) {
            const currentDate = new Date(goals[i].createdAt).getTime();
            const nextDate = new Date(goals[i + 1].createdAt).getTime();
            expect(currentDate).toBeGreaterThanOrEqual(nextDate);
          }
        });
    });

    it('GET /api/v1/goals - should include all goal types in history', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/goals',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const goals = JSON.parse(result.payload);

          const types = goals.map((g: any) => g.type);

          // History should contain different goal types
          expect(types).toContain('fat_loss');
          expect(types).toContain('muscle_gain');
          expect(types).toContain('performance');
          expect(types).toContain('maintenance');
        });
    });
  });

  // ============================================================================
  // GOAL UPDATES
  // ============================================================================

  describe('Goal Updates', () => {
    let updateGoalId: string;

    beforeEach(async () => {
      if (!testJWT) return;

      // Create a goal to update
      const newGoal = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/goals',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            type: 'fat_loss',
            description: 'Original description',
            targetDate: '2025-06-01T00:00:00.000Z',
            startWeightKg: 90,
            targetWeightKg: 80,
          },
        });
      updateGoalId = JSON.parse(newGoal.payload).id;
    });

    it('PATCH /api/v1/goals/:id - should update goal description', async () => {
      if (!testJWT || !updateGoalId) {
        console.warn('⏭️  Skipping test - no test JWT or goal ID available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/goals/${updateGoalId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            description: 'Updated description with more details',
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const goal = JSON.parse(result.payload);

          expect(goal).toHaveProperty('description', 'Updated description with more details');
          // Other fields should remain unchanged
          expect(goal).toHaveProperty('startWeightKg', '90');
          expect(goal).toHaveProperty('targetWeightKg', '80');
        });
    });

    it('PATCH /api/v1/goals/:id - should update target date', async () => {
      if (!testJWT || !updateGoalId) {
        console.warn('⏭️  Skipping test - no test JWT or goal ID available');
        return;
      }

      const newTargetDate = '2025-12-31T00:00:00.000Z';

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/goals/${updateGoalId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            targetDate: newTargetDate,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const goal = JSON.parse(result.payload);

          expect(goal).toHaveProperty('targetDate');
          const returnedDate = new Date(goal.targetDate);
          const expectedDate = new Date(newTargetDate);
          expect(returnedDate.toISOString()).toBe(expectedDate.toISOString());
        });
    });

    it('PATCH /api/v1/goals/:id - should update weight values', async () => {
      if (!testJWT || !updateGoalId) {
        console.warn('⏭️  Skipping test - no test JWT or goal ID available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/goals/${updateGoalId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            startWeightKg: 92,
            targetWeightKg: 78,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const goal = JSON.parse(result.payload);

          expect(goal).toHaveProperty('startWeightKg', '92');
          expect(goal).toHaveProperty('targetWeightKg', '78');
        });
    });

    it('PATCH /api/v1/goals/:id - should update multiple fields at once', async () => {
      if (!testJWT || !updateGoalId) {
        console.warn('⏭️  Skipping test - no test JWT or goal ID available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/goals/${updateGoalId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            description: 'Completely updated goal',
            targetDate: '2026-01-01T00:00:00.000Z',
            targetWeightKg: 75,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const goal = JSON.parse(result.payload);

          expect(goal).toHaveProperty('description', 'Completely updated goal');
          expect(goal).toHaveProperty('targetWeightKg', '75');
          expect(goal).toHaveProperty('targetDate');
        });
    });

    it('PATCH /api/v1/goals/:id - should return 404 for non-existent goal', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const fakeGoalId = '00000000-0000-0000-0000-000000000000';

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/goals/${fakeGoalId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            description: 'This should fail',
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(404);
        });
    });
  });

  // ============================================================================
  // GOAL DELETION
  // ============================================================================

  describe('Goal Deletion', () => {
    let deleteGoalId: string;

    beforeEach(async () => {
      if (!testJWT) return;

      // Create a goal to delete
      const newGoal = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/goals',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            type: 'performance',
            description: 'Goal to be deleted',
          },
        });
      deleteGoalId = JSON.parse(newGoal.payload).id;
    });

    it('DELETE /api/v1/goals/:id - should delete goal successfully', async () => {
      if (!testJWT || !deleteGoalId) {
        console.warn('⏭️  Skipping test - no test JWT or goal ID available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'DELETE',
          url: `/api/v1/goals/${deleteGoalId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(204);
        });
    });

    it('DELETE /api/v1/goals/:id - deleted goal should not be retrievable', async () => {
      if (!testJWT || !deleteGoalId) {
        console.warn('⏭️  Skipping test - no test JWT or goal ID available');
        return;
      }

      // Delete the goal
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'DELETE',
          url: `/api/v1/goals/${deleteGoalId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        });

      // Try to retrieve it
      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: `/api/v1/goals/${deleteGoalId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(404);
        });
    });

    it('DELETE /api/v1/goals/:id - should return 404 for non-existent goal', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const fakeGoalId = '00000000-0000-0000-0000-000000000000';

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'DELETE',
          url: `/api/v1/goals/${fakeGoalId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(404);
        });
    });

    it('DELETE /api/v1/goals/:id - should return 400 for invalid UUID', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'DELETE',
          url: '/api/v1/goals/invalid-uuid',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
        });
    });
  });
});
