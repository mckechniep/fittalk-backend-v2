/**
 * ============================================================================
 * COMPREHENSIVE ANALYTICS MODULE E2E TESTS
 * ============================================================================
 *
 * This test suite provides comprehensive coverage for analytics functionality:
 * ✅ Progress tracking (workout history with filtering)
 * ✅ Performance metrics (volume, weight progression, trends)
 * ✅ Personal records (PR) detection
 * ✅ Weekly/monthly summaries
 * ✅ Exercise-specific analytics
 * ✅ Time-based filtering and aggregations
 * ✅ First-time exercise detection
 * ✅ PR notification triggers
 *
 * NOTE: Analytics functionality is embedded in the workout-logging module.
 * This test suite focuses on testing analytics-related aspects of workout logging.
 *
 * SETUP INSTRUCTIONS:
 * - Create a test user in Supabase for your test database
 * - Seed exercises into the database: pnpm prisma db seed
 * - Add to .env.test:
 *   TEST_USER_EMAIL=test@fittalk.com
 *   TEST_USER_PASSWORD=TestPassword123!
 *
 * RUN TESTS:
 * - pnpm test:e2e test/analytics.e2e-spec.ts
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
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';

describe('Analytics Module (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notificationsService: NotificationsService;
  let testJWT: string | null = null;
  let testUserId: string | null = null;
  let testExerciseId: string | null = null;
  let prNotificationSpy: jest.SpyInstance;

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

        console.log('✅ Test JWT obtained for analytics tests');
        console.log(`   User ID: ${testUserId}`);
      } catch (error) {
        console.warn(
          '⚠️  Could not get test JWT - analytics tests will be skipped',
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

    // Get services
    prisma = app.get<PrismaService>(PrismaService);
    notificationsService = app.get<NotificationsService>(NotificationsService);

    // Spy on PR notifications
    prNotificationSpy = jest
      .spyOn(notificationsService, 'sendPrAchievedNotification')
      .mockResolvedValue(undefined);

    // Get test exercise
    if (testJWT) {
      const exercise = await prisma.exercise.findFirst();
      if (exercise) {
        testExerciseId = exercise.id;
      } else {
        console.warn('⚠️  No exercises found in database - some tests may fail');
      }
    }
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  // ============================================================================
  // PROGRESS TRACKING - WORKOUT HISTORY
  // ============================================================================

  describe('Progress Tracking - Workout History', () => {
    beforeEach(async () => {
      if (!testJWT || !testExerciseId) return;

      // Clean up old test data for this test suite
      await prisma.workoutLog.deleteMany({
        where: {
          userId: testUserId!,
          notes: { startsWith: 'Workout ' },
        },
      });

      // Create workout history (last 7 days)
      const today = new Date();
      for (let i = 0; i < 7; i++) {
        const performedAt = new Date(today);
        performedAt.setDate(today.getDate() - i);

        await app
          .getHttpAdapter()
          .getInstance()
          .inject({
            method: 'POST',
            url: '/api/v1/workout-logging',
            headers: {
              Authorization: `Bearer ${testJWT}`,
              'Content-Type': 'application/json',
            },
            payload: {
              exerciseId: testExerciseId,
              performedAt: performedAt.toISOString(),
              durationMin: 30,
              notes: `Workout ${i + 1}`,
              sets: [
                {
                  setNumber: 1,
                  reps: 10,
                  weightKg: 50 + i * 5, // Progressive overload
                  rir: 2,
                },
              ],
            },
          });
      }
    });

    it('GET /api/v1/workout-logging - should retrieve workout history', async () => {
      if (!testJWT || !testExerciseId) {
        console.warn('⏭️  Skipping test - no test JWT or exercise available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/workout-logging',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const response = JSON.parse(result.payload);

          expect(response).toHaveProperty('logs');
          expect(response).toHaveProperty('pagination');
          expect(Array.isArray(response.logs)).toBe(true);
          expect(response.logs.length).toBeGreaterThanOrEqual(7);
        });
    });

    it('GET /api/v1/workout-logging - should show progressive overload trend', async () => {
      if (!testJWT || !testExerciseId) {
        console.warn('⏭️  Skipping test - no test JWT or exercise available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/workout-logging',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          const response = JSON.parse(result.payload);
          const logs = response.logs;

          // Logs should be ordered by performedAt desc (newest first)
          // So weights should decrease as we go through the array
          if (logs.length >= 2) {
            const newestWeight = logs[0].sets[0].weightKg;
            const oldestWeight = logs[logs.length - 1].sets[0].weightKg;

            // Newest should be heavier (progressive overload)
            expect(parseFloat(newestWeight)).toBeGreaterThan(parseFloat(oldestWeight));
          }
        });
    });

    it('GET /api/v1/workout-logging?exerciseId=X - should filter by exercise', async () => {
      if (!testJWT || !testExerciseId) {
        console.warn('⏭️  Skipping test - no test JWT or exercise available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: `/api/v1/workout-logging?exerciseId=${testExerciseId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const response = JSON.parse(result.payload);

          // All logs should be for the specified exercise
          response.logs.forEach((log: any) => {
            expect(log.exerciseId).toBe(testExerciseId);
          });
        });
    });

    it('GET /api/v1/workout-logging?startDate=X&endDate=Y - should filter by date range', async () => {
      if (!testJWT || !testExerciseId) {
        console.warn('⏭️  Skipping test - no test JWT or exercise available');
        return;
      }

      const today = new Date();
      const threeDaysAgo = new Date(today);
      threeDaysAgo.setDate(today.getDate() - 3);

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: `/api/v1/workout-logging?startDate=${threeDaysAgo.toISOString()}&endDate=${today.toISOString()}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const response = JSON.parse(result.payload);

          // Should have workouts from last 3-4 days (inclusive of boundaries)
          expect(response.logs.length).toBeGreaterThanOrEqual(3);
          expect(response.logs.length).toBeLessThanOrEqual(5); // Allow for today + boundary conditions

          // All logs should be within date range
          response.logs.forEach((log: any) => {
            const performedAt = new Date(log.performedAt);
            expect(performedAt.getTime()).toBeGreaterThanOrEqual(threeDaysAgo.getTime());
            expect(performedAt.getTime()).toBeLessThanOrEqual(today.getTime());
          });
        });
    });

    it('GET /api/v1/workout-logging - should support pagination', async () => {
      if (!testJWT || !testExerciseId) {
        console.warn('⏭️  Skipping test - no test JWT or exercise available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/workout-logging?page=1&limit=5',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const response = JSON.parse(result.payload);

          expect(response.pagination).toHaveProperty('page', 1);
          expect(response.pagination).toHaveProperty('limit', 5);
          expect(response.pagination).toHaveProperty('total');
          expect(response.pagination).toHaveProperty('totalPages');
          expect(response.logs.length).toBeLessThanOrEqual(5);
        });
    });

    it('GET /api/v1/workout-logging - should order by performedAt desc (newest first)', async () => {
      if (!testJWT || !testExerciseId) {
        console.warn('⏭️  Skipping test - no test JWT or exercise available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/workout-logging',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          const response = JSON.parse(result.payload);
          const logs = response.logs;

          if (logs.length > 1) {
            for (let i = 0; i < logs.length - 1; i++) {
              const current = new Date(logs[i].performedAt);
              const next = new Date(logs[i + 1].performedAt);
              expect(current.getTime()).toBeGreaterThanOrEqual(next.getTime());
            }
          }
        });
    });
  });

  // ============================================================================
  // PERSONAL RECORDS (PR) DETECTION
  // ============================================================================

  describe('Personal Records Detection', () => {
    it('POST /api/v1/workout-logging - should detect first-time PR', async () => {
      if (!testJWT || !testExerciseId) {
        console.warn('⏭️  Skipping test - no test JWT or exercise available');
        return;
      }

      // Get a unique exercise for this test
      const uniqueExercise = await prisma.exercise.findFirst({
        where: {
          id: { not: testExerciseId },
        },
      });

      if (!uniqueExercise) {
        console.warn('⏭️  Skipping test - need at least 2 exercises');
        return;
      }

      prNotificationSpy.mockClear();

      // First time doing this exercise
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/workout-logging',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            exerciseId: uniqueExercise.id,
            performedAt: new Date().toISOString(),
            durationMin: 30,
            sets: [
              {
                setNumber: 1,
                reps: 10,
                weightKg: 60,
                rir: 2,
              },
            ],
          },
        });

      // Should trigger PR notification (first time)
      expect(prNotificationSpy).toHaveBeenCalledWith(
        testUserId,
        uniqueExercise.name,
        expect.objectContaining({
          weight: 60,
          reps: 10,
        }),
      );
    });

    it('POST /api/v1/workout-logging - should detect weight PR (same reps, higher weight)', async () => {
      if (!testJWT || !testExerciseId) {
        console.warn('⏭️  Skipping test - no test JWT or exercise available');
        return;
      }

      // Baseline workout
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/workout-logging',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            exerciseId: testExerciseId,
            performedAt: new Date().toISOString(),
            durationMin: 30,
            sets: [
              {
                setNumber: 1,
                reps: 10,
                weightKg: 80,
                rir: 2,
              },
            ],
          },
        });

      prNotificationSpy.mockClear();

      // PR workout (same reps, more weight)
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/workout-logging',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            exerciseId: testExerciseId,
            performedAt: new Date().toISOString(),
            durationMin: 30,
            sets: [
              {
                setNumber: 1,
                reps: 10,
                weightKg: 85, // 5kg more!
                rir: 2,
              },
            ],
          },
        });

      // Should detect PR
      expect(prNotificationSpy).toHaveBeenCalledWith(
        testUserId,
        expect.any(String),
        expect.objectContaining({
          weight: 85,
          reps: 10,
        }),
      );
    });

    it('POST /api/v1/workout-logging - should detect rep PR (same weight, more reps)', async () => {
      if (!testJWT || !testExerciseId) {
        console.warn('⏭️  Skipping test - no test JWT or exercise available');
        return;
      }

      // Baseline
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/workout-logging',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            exerciseId: testExerciseId,
            performedAt: new Date().toISOString(),
            durationMin: 30,
            sets: [
              {
                setNumber: 1,
                reps: 8,
                weightKg: 100,
                rir: 2,
              },
            ],
          },
        });

      prNotificationSpy.mockClear();

      // PR (same weight, more reps)
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/workout-logging',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            exerciseId: testExerciseId,
            performedAt: new Date().toISOString(),
            durationMin: 30,
            sets: [
              {
                setNumber: 1,
                reps: 12, // 4 more reps!
                weightKg: 100,
                rir: 2,
              },
            ],
          },
        });

      // Should detect PR
      expect(prNotificationSpy).toHaveBeenCalledWith(
        testUserId,
        expect.any(String),
        expect.objectContaining({
          weight: 100,
          reps: 12,
        }),
      );
    });

    it('POST /api/v1/workout-logging - should NOT detect PR if performance regresses', async () => {
      if (!testJWT || !testExerciseId) {
        console.warn('⏭️  Skipping test - no test JWT or exercise available');
        return;
      }

      // Baseline
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/workout-logging',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            exerciseId: testExerciseId,
            performedAt: new Date().toISOString(),
            durationMin: 30,
            sets: [
              {
                setNumber: 1,
                reps: 10,
                weightKg: 100,
                rir: 2,
              },
            ],
          },
        });

      prNotificationSpy.mockClear();

      // Regression (less weight)
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/workout-logging',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            exerciseId: testExerciseId,
            performedAt: new Date().toISOString(),
            durationMin: 30,
            sets: [
              {
                setNumber: 1,
                reps: 10,
                weightKg: 90, // Less weight
                rir: 2,
              },
            ],
          },
        });

      // Should NOT detect PR
      expect(prNotificationSpy).not.toHaveBeenCalled();
    });

    it('POST /api/v1/workout-logging - should NOT detect PR if same performance', async () => {
      if (!testJWT || !testExerciseId) {
        console.warn('⏭️  Skipping test - no test JWT or exercise available');
        return;
      }

      // Baseline
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/workout-logging',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            exerciseId: testExerciseId,
            performedAt: new Date().toISOString(),
            durationMin: 30,
            sets: [
              {
                setNumber: 1,
                reps: 10,
                weightKg: 80,
                rir: 2,
              },
            ],
          },
        });

      prNotificationSpy.mockClear();

      // Same performance
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/workout-logging',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            exerciseId: testExerciseId,
            performedAt: new Date().toISOString(),
            durationMin: 30,
            sets: [
              {
                setNumber: 1,
                reps: 10,
                weightKg: 80, // Same
                rir: 2,
              },
            ],
          },
        });

      // Should NOT detect PR
      expect(prNotificationSpy).not.toHaveBeenCalled();
    });

    it('POST /api/v1/workout-logging - should detect best PR from multiple sets', async () => {
      if (!testJWT || !testExerciseId) {
        console.warn('⏭️  Skipping test - no test JWT or exercise available');
        return;
      }

      // Baseline
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/workout-logging',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            exerciseId: testExerciseId,
            performedAt: new Date().toISOString(),
            durationMin: 30,
            sets: [
              { setNumber: 1, reps: 10, weightKg: 60, rir: 2 },
            ],
          },
        });

      prNotificationSpy.mockClear();

      // Multiple PRs in one workout
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/workout-logging',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            exerciseId: testExerciseId,
            performedAt: new Date().toISOString(),
            durationMin: 30,
            sets: [
              { setNumber: 1, reps: 10, weightKg: 65, rir: 2 }, // PR
              { setNumber: 2, reps: 10, weightKg: 70, rir: 2 }, // Better PR
              { setNumber: 3, reps: 8, weightKg: 75, rir: 2 }, // Best PR
            ],
          },
        });

      // Should notify about the best PR (highest weight)
      expect(prNotificationSpy).toHaveBeenCalledWith(
        testUserId,
        expect.any(String),
        expect.objectContaining({
          weight: 75,
          reps: 8,
        }),
      );
    });
  });

  // ============================================================================
  // PERFORMANCE METRICS
  // ============================================================================

  describe('Performance Metrics', () => {
    it('should calculate total volume for workout (sets × reps × weight)', async () => {
      if (!testJWT || !testExerciseId) {
        console.warn('⏭️  Skipping test - no test JWT or exercise available');
        return;
      }

      const result = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/workout-logging',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            exerciseId: testExerciseId,
            performedAt: new Date().toISOString(),
            durationMin: 30,
            sets: [
              { setNumber: 1, reps: 10, weightKg: 100, rir: 2 },
              { setNumber: 2, reps: 10, weightKg: 100, rir: 2 },
              { setNumber: 3, reps: 8, weightKg: 100, rir: 3 },
            ],
          },
        });

      const log = JSON.parse(result.payload);

      // Total volume = (10 × 100) + (10 × 100) + (8 × 100) = 2800kg
      const totalVolume = log.sets.reduce((sum: number, set: any) => {
        return sum + (set.reps * parseFloat(set.weightKg));
      }, 0);

      expect(totalVolume).toBe(2800);
    });

    it('should track workout duration', async () => {
      if (!testJWT || !testExerciseId) {
        console.warn('⏭️  Skipping test - no test JWT or exercise available');
        return;
      }

      const result = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/workout-logging',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            exerciseId: testExerciseId,
            performedAt: new Date().toISOString(),
            durationMin: 45,
            sets: [
              { setNumber: 1, reps: 10, weightKg: 80, rir: 2 },
            ],
          },
        });

      const log = JSON.parse(result.payload);
      expect(log).toHaveProperty('durationMin', 45);
    });

    it('should track RIR (Reps In Reserve) for intensity monitoring', async () => {
      if (!testJWT || !testExerciseId) {
        console.warn('⏭️  Skipping test - no test JWT or exercise available');
        return;
      }

      const result = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/workout-logging',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            exerciseId: testExerciseId,
            performedAt: new Date().toISOString(),
            durationMin: 30,
            sets: [
              { setNumber: 1, reps: 10, weightKg: 80, rir: 0 }, // To failure
              { setNumber: 2, reps: 10, weightKg: 80, rir: 2 }, // Easy
            ],
          },
        });

      const log = JSON.parse(result.payload);

      expect(log.sets[0]).toHaveProperty('rir', '0'); // To failure
      expect(log.sets[1]).toHaveProperty('rir', '2'); // Easy
    });

    it('should show improvement trend over multiple workouts', async () => {
      if (!testJWT || !testExerciseId) {
        console.warn('⏭️  Skipping test - no test JWT or exercise available');
        return;
      }

      // Week 1
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/workout-logging',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            exerciseId: testExerciseId,
            performedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            durationMin: 30,
            sets: [{ setNumber: 1, reps: 8, weightKg: 60, rir: 2 }],
          },
        });

      // Week 2
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/workout-logging',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            exerciseId: testExerciseId,
            performedAt: new Date().toISOString(),
            durationMin: 30,
            sets: [{ setNumber: 1, reps: 10, weightKg: 65, rir: 2 }],
          },
        });

      // Get history
      const history = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: `/api/v1/workout-logging?exerciseId=${testExerciseId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        });

      const response = JSON.parse(history.payload);
      const logs = response.logs;

      // Should show improvement
      const latestWeight = parseFloat(logs[0].sets[0].weightKg);
      const earliestWeight = parseFloat(logs[logs.length - 1].sets[0].weightKg);

      expect(latestWeight).toBeGreaterThan(earliestWeight);
    });
  });

  // ============================================================================
  // WEEKLY/MONTHLY SUMMARIES
  // ============================================================================

  describe('Weekly/Monthly Summaries', () => {
    beforeEach(async () => {
      if (!testJWT || !testExerciseId) return;

      // Clean up old summary test data
      await prisma.workoutLog.deleteMany({
        where: {
          userId: testUserId!,
          durationMin: 45,
          sets: {
            some: {
              weightKg: 80,
            },
          },
        },
      });

      // Create 30 days of workout data
      const today = new Date();
      for (let i = 0; i < 30; i++) {
        const performedAt = new Date(today);
        performedAt.setDate(today.getDate() - i);

        await app
          .getHttpAdapter()
          .getInstance()
          .inject({
            method: 'POST',
            url: '/api/v1/workout-logging',
            headers: {
              Authorization: `Bearer ${testJWT}`,
              'Content-Type': 'application/json',
            },
            payload: {
              exerciseId: testExerciseId,
              performedAt: performedAt.toISOString(),
              durationMin: 45,
              sets: [
                { setNumber: 1, reps: 10, weightKg: 80, rir: 2 },
                { setNumber: 2, reps: 10, weightKg: 80, rir: 2 },
                { setNumber: 3, reps: 8, weightKg: 80, rir: 3 },
              ],
            },
          });
      }
    });

    it('should get last 7 days summary', async () => {
      if (!testJWT || !testExerciseId) {
        console.warn('⏭️  Skipping test - no test JWT or exercise available');
        return;
      }

      const today = new Date();
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(today.getDate() - 7);

      const result = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: `/api/v1/workout-logging?startDate=${sevenDaysAgo.toISOString()}&endDate=${today.toISOString()}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        });

      const response = JSON.parse(result.payload);

      // Should have ~7-8 workouts (7 days worth, potentially 8 due to date boundaries)
      expect(response.logs.length).toBeGreaterThanOrEqual(7);
      expect(response.logs.length).toBeLessThanOrEqual(9);

      // Calculate total volume for the week
      const totalVolume = response.logs.reduce((sum: number, log: any) => {
        const logVolume = log.sets.reduce((setSum: number, set: any) => {
          return setSum + (set.reps * parseFloat(set.weightKg));
        }, 0);
        return sum + logVolume;
      }, 0);

      expect(totalVolume).toBeGreaterThan(0);
    });

    it('should get last 30 days summary', async () => {
      if (!testJWT || !testExerciseId) {
        console.warn('⏭️  Skipping test - no test JWT or exercise available');
        return;
      }

      const today = new Date();
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(today.getDate() - 30);

      const result = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: `/api/v1/workout-logging?startDate=${thirtyDaysAgo.toISOString()}&endDate=${today.toISOString()}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        });

      const response = JSON.parse(result.payload);

      // Should have ~30-31 workouts (30 days worth, potentially more due to date boundaries)
      expect(response.logs.length).toBeGreaterThanOrEqual(30);

      // Calculate metrics
      const totalWorkouts = response.logs.length;
      const totalMinutes = response.logs.reduce((sum: number, log: any) => {
        return sum + (log.durationMin || 0);
      }, 0);
      const avgDurationPerWorkout = totalMinutes / totalWorkouts;

      expect(avgDurationPerWorkout).toBeCloseTo(45, 0);
    });

    it('should calculate workout frequency (workouts per week)', async () => {
      if (!testJWT || !testExerciseId) {
        console.warn('⏭️  Skipping test - no test JWT or exercise available');
        return;
      }

      const today = new Date();
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(today.getDate() - 30);

      const result = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: `/api/v1/workout-logging?startDate=${thirtyDaysAgo.toISOString()}&endDate=${today.toISOString()}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        });

      const response = JSON.parse(result.payload);

      const totalWorkouts = response.logs.length;
      const weeks = 30 / 7;
      const workoutsPerWeek = totalWorkouts / weeks;

      // Should be ~7 workouts per week (daily in test data)
      expect(workoutsPerWeek).toBeGreaterThan(6);
      expect(workoutsPerWeek).toBeLessThan(9);
    });

    it('should calculate total volume for period', async () => {
      if (!testJWT || !testExerciseId) {
        console.warn('⏭️  Skipping test - no test JWT or exercise available');
        return;
      }

      const today = new Date();
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(today.getDate() - 7);

      const result = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: `/api/v1/workout-logging?exerciseId=${testExerciseId}&startDate=${sevenDaysAgo.toISOString()}&endDate=${today.toISOString()}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        });

      const response = JSON.parse(result.payload);

      // Calculate total volume (sets × reps × weight)
      const totalVolume = response.logs.reduce((sum: number, log: any) => {
        const logVolume = log.sets.reduce((setSum: number, set: any) => {
          return setSum + (set.reps * parseFloat(set.weightKg));
        }, 0);
        return sum + logVolume;
      }, 0);

      // Each workout has 3 sets: (10×80) + (10×80) + (8×80) = 2240kg
      // 7 days × 2240 = 15,680kg
      expect(totalVolume).toBeGreaterThan(15000);
      expect(totalVolume).toBeLessThan(17000);
    });
  });

  // ============================================================================
  // EXERCISE-SPECIFIC ANALYTICS
  // ============================================================================

  describe('Exercise-Specific Analytics', () => {
    it('should show exercise progression over time', async () => {
      if (!testJWT || !testExerciseId) {
        console.warn('⏭️  Skipping test - no test JWT or exercise available');
        return;
      }

      // Create progression: 60kg → 70kg → 80kg
      const weights = [60, 70, 80];
      for (let i = 0; i < weights.length; i++) {
        const performedAt = new Date();
        performedAt.setDate(performedAt.getDate() - (weights.length - i));

        await app
          .getHttpAdapter()
          .getInstance()
          .inject({
            method: 'POST',
            url: '/api/v1/workout-logging',
            headers: {
              Authorization: `Bearer ${testJWT}`,
              'Content-Type': 'application/json',
            },
            payload: {
              exerciseId: testExerciseId,
              performedAt: performedAt.toISOString(),
              durationMin: 30,
              sets: [{ setNumber: 1, reps: 10, weightKg: weights[i], rir: 2 }],
            },
          });
      }

      // Get exercise history
      const result = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: `/api/v1/workout-logging?exerciseId=${testExerciseId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        });

      const response = JSON.parse(result.payload);
      const exerciseLogs = response.logs.slice(0, 3); // Latest 3

      // Verify progression (newest to oldest)
      expect(parseFloat(exerciseLogs[0].sets[0].weightKg)).toBe(80);
      expect(parseFloat(exerciseLogs[1].sets[0].weightKg)).toBe(70);
      expect(parseFloat(exerciseLogs[2].sets[0].weightKg)).toBe(60);
    });

    it('should show best set for exercise', async () => {
      if (!testJWT || !testExerciseId) {
        console.warn('⏭️  Skipping test - no test JWT or exercise available');
        return;
      }

      // Create multiple workouts with different weights
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/workout-logging',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            exerciseId: testExerciseId,
            performedAt: new Date().toISOString(),
            durationMin: 30,
            sets: [
              { setNumber: 1, reps: 10, weightKg: 100, rir: 2 },
              { setNumber: 2, reps: 8, weightKg: 110, rir: 2 }, // Best
              { setNumber: 3, reps: 12, weightKg: 90, rir: 2 },
            ],
          },
        });

      const result = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: `/api/v1/workout-logging?exerciseId=${testExerciseId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        });

      const response = JSON.parse(result.payload);
      const allSets = response.logs.flatMap((log: any) => log.sets);

      // Find best set (highest weight)
      const bestSet = allSets.reduce((best: any, current: any) => {
        const currentWeight = parseFloat(current.weightKg);
        const bestWeight = parseFloat(best.weightKg);
        return currentWeight > bestWeight ? current : best;
      });

      expect(parseFloat(bestSet.weightKg)).toBe(110);
      expect(bestSet.reps).toBe(8);
    });
  });

  // ============================================================================
  // ERROR HANDLING & EDGE CASES
  // ============================================================================

  describe('Error Handling & Edge Cases', () => {
    it('should handle empty workout history gracefully', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      // Get logs for far future date (should be empty)
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const result = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: `/api/v1/workout-logging?startDate=${futureDate.toISOString()}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        });

      const response = JSON.parse(result.payload);
      expect(response.logs).toEqual([]);
      expect(response.pagination.total).toBe(0);
    });

    it('should handle workout with no completed sets (all skipped)', async () => {
      if (!testJWT || !testExerciseId) {
        console.warn('⏭️  Skipping test - no test JWT or exercise available');
        return;
      }

      prNotificationSpy.mockClear();

      const result = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/workout-logging',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            exerciseId: testExerciseId,
            performedAt: new Date().toISOString(),
            durationMin: 10,
            sets: [], // No sets!
          },
        });

      expect(result.statusCode).toBe(201);

      // Should not trigger PR check (no sets)
      expect(prNotificationSpy).not.toHaveBeenCalled();
    });
  });
});
