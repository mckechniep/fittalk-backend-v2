/**
 * ============================================================================
 * COMPREHENSIVE AVAILABILITY MODULE E2E TESTS
 * ============================================================================
 *
 * This test suite provides comprehensive coverage for availability windows:
 * ✅ Create availability windows (upsert/replace all strategy)
 * ✅ Update availability windows (replace all atomically)
 * ✅ Get user availability windows
 * ✅ Delete specific availability windows
 * ✅ Overlap detection and conflict validation
 * ✅ Time range validation (startMin < endMin)
 * ✅ Priority handling and edge cases
 * ✅ Day of week validation (0-6)
 * ✅ Minute range validation (0-1439)
 * ✅ User isolation and authorization
 *
 * SETUP INSTRUCTIONS:
 * - Create a test user in Supabase for your test database
 * - Add to .env.test:
 *   TEST_USER_EMAIL=test@fittalk.com
 *   TEST_USER_PASSWORD=TestPassword123!
 *
 * RUN TESTS:
 * - pnpm test:e2e test/availability.e2e-spec.ts
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

describe('Availability Module (e2e)', () => {
  let app: INestApplication;
  let testJWT: string | null = null;
  let testUserId: string | null = null;

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

        console.log('✅ Test JWT obtained for availability tests');
        console.log(`   User ID: ${testUserId}`);
      } catch (error) {
        console.warn(
          '⚠️  Could not get test JWT - availability tests will be skipped',
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
  // AVAILABILITY CREATION
  // ============================================================================

  describe('Availability Creation', () => {
    it('POST /api/v1/availability - should create single availability window', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const windows = {
        windows: [
          {
            dayOfWeek: 1, // Monday
            startMin: 540, // 9:00 AM
            endMin: 1020, // 5:00 PM
            priority: 2,
          },
        ],
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: windows,
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const created = JSON.parse(result.payload);

          expect(Array.isArray(created)).toBe(true);
          expect(created.length).toBe(1);
          expect(created[0]).toHaveProperty('id');
          expect(created[0]).toHaveProperty('userId', testUserId);
          expect(created[0]).toHaveProperty('dayOfWeek', 1);
          expect(created[0]).toHaveProperty('startMin', 540);
          expect(created[0]).toHaveProperty('endMin', 1020);
          expect(created[0]).toHaveProperty('priority', 2);
          expect(created[0]).toHaveProperty('createdAt');
          expect(created[0]).toHaveProperty('updatedAt');
        });
    });

    it('POST /api/v1/availability - should create multiple windows across different days', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const windows = {
        windows: [
          { dayOfWeek: 1, startMin: 540, endMin: 1020, priority: 2 }, // Monday 9am-5pm
          { dayOfWeek: 3, startMin: 360, endMin: 720, priority: 1 }, // Wednesday 6am-12pm
          { dayOfWeek: 5, startMin: 1080, endMin: 1320, priority: 0 }, // Friday 6pm-10pm
        ],
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: windows,
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const created = JSON.parse(result.payload);

          expect(created.length).toBe(3);

          // Verify each day
          const monday = created.find((w: any) => w.dayOfWeek === 1);
          const wednesday = created.find((w: any) => w.dayOfWeek === 3);
          const friday = created.find((w: any) => w.dayOfWeek === 5);

          expect(monday).toBeDefined();
          expect(wednesday).toBeDefined();
          expect(friday).toBeDefined();
        });
    });

    it('POST /api/v1/availability - should create multiple non-overlapping windows on same day', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const windows = {
        windows: [
          { dayOfWeek: 1, startMin: 360, endMin: 540 }, // Monday 6am-9am
          { dayOfWeek: 1, startMin: 1080, endMin: 1260 }, // Monday 6pm-9pm
        ],
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: windows,
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const created = JSON.parse(result.payload);

          expect(created.length).toBe(2);
          created.forEach((window: any) => {
            expect(window.dayOfWeek).toBe(1);
          });
        });
    });

    it('POST /api/v1/availability - should create windows for all days of week', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const windows = {
        windows: [
          { dayOfWeek: 0, startMin: 540, endMin: 720 }, // Sunday
          { dayOfWeek: 1, startMin: 540, endMin: 720 }, // Monday
          { dayOfWeek: 2, startMin: 540, endMin: 720 }, // Tuesday
          { dayOfWeek: 3, startMin: 540, endMin: 720 }, // Wednesday
          { dayOfWeek: 4, startMin: 540, endMin: 720 }, // Thursday
          { dayOfWeek: 5, startMin: 540, endMin: 720 }, // Friday
          { dayOfWeek: 6, startMin: 540, endMin: 720 }, // Saturday
        ],
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: windows,
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const created = JSON.parse(result.payload);

          expect(created.length).toBe(7);

          // Verify all days present
          const days = created.map((w: any) => w.dayOfWeek).sort();
          expect(days).toEqual([0, 1, 2, 3, 4, 5, 6]);
        });
    });

    it('POST /api/v1/availability - should create window with default priority (0)', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const windows = {
        windows: [
          {
            dayOfWeek: 2,
            startMin: 600,
            endMin: 900,
            // No priority specified
          },
        ],
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: windows,
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const created = JSON.parse(result.payload);

          expect(created[0]).toHaveProperty('priority', 0);
        });
    });

    it('POST /api/v1/availability - should create window with edge time values', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const windows = {
        windows: [
          {
            dayOfWeek: 1,
            startMin: 0, // Midnight
            endMin: 1439, // 11:59 PM
            priority: 1,
          },
        ],
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: windows,
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const created = JSON.parse(result.payload);

          expect(created[0]).toHaveProperty('startMin', 0);
          expect(created[0]).toHaveProperty('endMin', 1439);
        });
    });

    it('POST /api/v1/availability - should clear all windows with empty array', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      // First create some windows
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            windows: [
              { dayOfWeek: 1, startMin: 540, endMin: 1020 },
            ],
          },
        });

      // Then clear them
      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: { windows: [] },
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const created = JSON.parse(result.payload);

          expect(Array.isArray(created)).toBe(true);
          expect(created.length).toBe(0);
        });
    });

    it('POST /api/v1/availability - should reject without authentication', async () => {
      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            'Content-Type': 'application/json',
          },
          payload: {
            windows: [
              { dayOfWeek: 1, startMin: 540, endMin: 1020 },
            ],
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(401);
        });
    });
  });

  // ============================================================================
  // AVAILABILITY UPDATES (REPLACE ALL STRATEGY)
  // ============================================================================

  describe('Availability Updates', () => {
    beforeEach(async () => {
      if (!testJWT) return;

      // Create initial availability
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            windows: [
              { dayOfWeek: 1, startMin: 540, endMin: 1020, priority: 1 },
              { dayOfWeek: 3, startMin: 540, endMin: 1020, priority: 1 },
            ],
          },
        });
    });

    it('POST /api/v1/availability - should replace all existing windows', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      // Update with completely different windows
      const newWindows = {
        windows: [
          { dayOfWeek: 2, startMin: 360, endMin: 720, priority: 2 }, // Tuesday
          { dayOfWeek: 4, startMin: 600, endMin: 900, priority: 1 }, // Thursday
          { dayOfWeek: 6, startMin: 480, endMin: 840, priority: 0 }, // Saturday
        ],
      };

      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: newWindows,
        });

      // Verify old windows are gone and new ones exist
      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const windows = JSON.parse(result.payload);

          expect(windows.length).toBe(3);

          // Old days (Monday=1, Wednesday=3) should be gone
          expect(windows.find((w: any) => w.dayOfWeek === 1)).toBeUndefined();
          expect(windows.find((w: any) => w.dayOfWeek === 3)).toBeUndefined();

          // New days should exist
          expect(windows.find((w: any) => w.dayOfWeek === 2)).toBeDefined();
          expect(windows.find((w: any) => w.dayOfWeek === 4)).toBeDefined();
          expect(windows.find((w: any) => w.dayOfWeek === 6)).toBeDefined();
        });
    });

    it('POST /api/v1/availability - should update times for existing day', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      // Keep Monday but change times
      const updatedWindows = {
        windows: [
          { dayOfWeek: 1, startMin: 360, endMin: 720, priority: 2 }, // Changed from 540-1020
        ],
      };

      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: updatedWindows,
        });

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          const windows = JSON.parse(result.payload);
          const monday = windows.find((w: any) => w.dayOfWeek === 1);

          expect(monday).toBeDefined();
          expect(monday.startMin).toBe(360);
          expect(monday.endMin).toBe(720);
          expect(monday.priority).toBe(2);
        });
    });

    it('POST /api/v1/availability - should add new days while removing others', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      // Keep Monday, remove Wednesday, add Friday and Sunday
      const updatedWindows = {
        windows: [
          { dayOfWeek: 1, startMin: 540, endMin: 1020, priority: 1 }, // Keep
          { dayOfWeek: 5, startMin: 600, endMin: 900, priority: 2 }, // Add Friday
          { dayOfWeek: 0, startMin: 480, endMin: 780, priority: 0 }, // Add Sunday
        ],
      };

      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: updatedWindows,
        });

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          const windows = JSON.parse(result.payload);

          expect(windows.length).toBe(3);
          expect(windows.find((w: any) => w.dayOfWeek === 1)).toBeDefined(); // Monday kept
          expect(windows.find((w: any) => w.dayOfWeek === 3)).toBeUndefined(); // Wednesday removed
          expect(windows.find((w: any) => w.dayOfWeek === 5)).toBeDefined(); // Friday added
          expect(windows.find((w: any) => w.dayOfWeek === 0)).toBeDefined(); // Sunday added
        });
    });

    it('POST /api/v1/availability - should atomically replace (transaction)', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      // Attempt to update with invalid data (overlapping windows)
      const invalidWindows = {
        windows: [
          { dayOfWeek: 1, startMin: 540, endMin: 900 },
          { dayOfWeek: 1, startMin: 720, endMin: 1020 }, // Overlaps with above
        ],
      };

      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: invalidWindows,
        });

      // Verify original windows still exist (transaction rolled back)
      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          const windows = JSON.parse(result.payload);

          // Should still have original 2 windows (Monday and Wednesday)
          expect(windows.length).toBe(2);
        });
    });
  });

  // ============================================================================
  // AVAILABILITY RETRIEVAL
  // ============================================================================

  describe('Availability Retrieval', () => {
    it('GET /api/v1/availability - should return empty array when no windows set', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      // First clear any existing windows
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: { windows: [] },
        });

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const windows = JSON.parse(result.payload);

          expect(Array.isArray(windows)).toBe(true);
          expect(windows.length).toBe(0);
        });
    });

    it('GET /api/v1/availability - should return all user windows', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      // Create windows
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            windows: [
              { dayOfWeek: 1, startMin: 540, endMin: 1020, priority: 2 },
              { dayOfWeek: 3, startMin: 360, endMin: 720, priority: 1 },
              { dayOfWeek: 5, startMin: 600, endMin: 900, priority: 0 },
            ],
          },
        });

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const windows = JSON.parse(result.payload);

          expect(windows.length).toBe(3);
          windows.forEach((window: any) => {
            expect(window).toHaveProperty('id');
            expect(window).toHaveProperty('userId', testUserId);
            expect(window).toHaveProperty('dayOfWeek');
            expect(window).toHaveProperty('startMin');
            expect(window).toHaveProperty('endMin');
            expect(window).toHaveProperty('priority');
            expect(window).toHaveProperty('createdAt');
            expect(window).toHaveProperty('updatedAt');
          });
        });
    });

    it('GET /api/v1/availability - should order windows by day and start time', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      // Create windows in random order
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            windows: [
              { dayOfWeek: 5, startMin: 600, endMin: 900 }, // Friday morning
              { dayOfWeek: 1, startMin: 1080, endMin: 1320 }, // Monday evening
              { dayOfWeek: 1, startMin: 360, endMin: 540 }, // Monday morning
              { dayOfWeek: 3, startMin: 540, endMin: 1020 }, // Wednesday
            ],
          },
        });

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          const windows = JSON.parse(result.payload);

          // Should be ordered by day, then start time
          expect(windows[0].dayOfWeek).toBe(1);
          expect(windows[0].startMin).toBe(360); // Monday morning first
          expect(windows[1].dayOfWeek).toBe(1);
          expect(windows[1].startMin).toBe(1080); // Monday evening second
          expect(windows[2].dayOfWeek).toBe(3); // Wednesday
          expect(windows[3].dayOfWeek).toBe(5); // Friday
        });
    });

    it('GET /api/v1/availability - should not return other users windows', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      // Create windows for current user
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            windows: [
              { dayOfWeek: 1, startMin: 540, endMin: 1020 },
            ],
          },
        });

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          const windows = JSON.parse(result.payload);

          // All windows should belong to test user
          windows.forEach((window: any) => {
            expect(window.userId).toBe(testUserId);
          });
        });
    });

    it('GET /api/v1/availability - should reject without authentication', async () => {
      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/availability',
          headers: {},
        })
        .then((result) => {
          expect(result.statusCode).toBe(401);
        });
    });
  });

  // ============================================================================
  // DELETE SPECIFIC WINDOW
  // ============================================================================

  describe('Delete Specific Window', () => {
    let windowId: string;

    beforeEach(async () => {
      if (!testJWT) return;

      // Create windows
      const result = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            windows: [
              { dayOfWeek: 1, startMin: 540, endMin: 1020, priority: 1 },
              { dayOfWeek: 3, startMin: 360, endMin: 720, priority: 2 },
            ],
          },
        });

      const windows = JSON.parse(result.payload);
      windowId = windows[0].id;
    });

    it('DELETE /api/v1/availability/:id - should delete specific window', async () => {
      if (!testJWT || !windowId) {
        console.warn('⏭️  Skipping test - no test JWT or window ID available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'DELETE',
          url: `/api/v1/availability/${windowId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(204);
        });
    });

    it('DELETE /api/v1/availability/:id - deleted window should not be retrievable', async () => {
      if (!testJWT || !windowId) {
        console.warn('⏭️  Skipping test - no test JWT or window ID available');
        return;
      }

      // Delete the window
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'DELETE',
          url: `/api/v1/availability/${windowId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        });

      // Verify it's gone
      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          const windows = JSON.parse(result.payload);

          // Should only have 1 window left (started with 2)
          expect(windows.length).toBe(1);
          expect(windows.find((w: any) => w.id === windowId)).toBeUndefined();
        });
    });

    it('DELETE /api/v1/availability/:id - should keep other windows when deleting one', async () => {
      if (!testJWT || !windowId) {
        console.warn('⏭️  Skipping test - no test JWT or window ID available');
        return;
      }

      // Get the other window ID before deletion
      const beforeResult = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        });
      const beforeWindows = JSON.parse(beforeResult.payload);
      const otherWindowId = beforeWindows.find((w: any) => w.id !== windowId)?.id;

      // Delete first window
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'DELETE',
          url: `/api/v1/availability/${windowId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        });

      // Verify other window still exists
      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          const windows = JSON.parse(result.payload);

          expect(windows.length).toBe(1);
          expect(windows[0].id).toBe(otherWindowId);
        });
    });

    it('DELETE /api/v1/availability/:id - should return 404 for non-existent window', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const fakeWindowId = '00000000-0000-0000-0000-000000000000';

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'DELETE',
          url: `/api/v1/availability/${fakeWindowId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(404);
        });
    });

    it('DELETE /api/v1/availability/:id - should return 400 for invalid UUID', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'DELETE',
          url: '/api/v1/availability/invalid-uuid',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
        });
    });

    it('DELETE /api/v1/availability/:id - should reject without authentication', async () => {
      if (!windowId) return;

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'DELETE',
          url: `/api/v1/availability/${windowId}`,
          headers: {},
        })
        .then((result) => {
          expect(result.statusCode).toBe(401);
        });
    });
  });

  // ============================================================================
  // OVERLAP DETECTION AND CONFLICT VALIDATION
  // ============================================================================

  describe('Overlap Detection', () => {
    it('POST /api/v1/availability - should reject overlapping windows (exact overlap)', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const windows = {
        windows: [
          { dayOfWeek: 1, startMin: 540, endMin: 1020 },
          { dayOfWeek: 1, startMin: 540, endMin: 1020 }, // Exact same
        ],
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: windows,
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
          const error = JSON.parse(result.payload);
          expect(error.message).toContain('Overlapping');
        });
    });

    it('POST /api/v1/availability - should reject overlapping windows (partial overlap)', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const windows = {
        windows: [
          { dayOfWeek: 1, startMin: 540, endMin: 900 }, // 9am-3pm
          { dayOfWeek: 1, startMin: 720, endMin: 1020 }, // 12pm-5pm (overlaps 12pm-3pm)
        ],
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: windows,
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
          const error = JSON.parse(result.payload);
          expect(error.message).toContain('Overlapping');
        });
    });

    it('POST /api/v1/availability - should reject when one window contains another', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const windows = {
        windows: [
          { dayOfWeek: 1, startMin: 540, endMin: 1020 }, // 9am-5pm
          { dayOfWeek: 1, startMin: 600, endMin: 900 }, // 10am-3pm (inside above)
        ],
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: windows,
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
          const error = JSON.parse(result.payload);
          expect(error.message).toContain('Overlapping');
        });
    });

    it('POST /api/v1/availability - should reject windows sharing edge (end time = start time)', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const windows = {
        windows: [
          { dayOfWeek: 1, startMin: 540, endMin: 720 }, // 9am-12pm
          { dayOfWeek: 1, startMin: 720, endMin: 900 }, // 12pm-3pm (shares edge at 12pm)
        ],
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: windows,
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
          const error = JSON.parse(result.payload);
          expect(error.message).toContain('Overlapping');
        });
    });

    it('POST /api/v1/availability - should allow overlaps on different days', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const windows = {
        windows: [
          { dayOfWeek: 1, startMin: 540, endMin: 1020 }, // Monday 9am-5pm
          { dayOfWeek: 3, startMin: 540, endMin: 1020 }, // Wednesday 9am-5pm (same times, different day)
        ],
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: windows,
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const created = JSON.parse(result.payload);
          expect(created.length).toBe(2);
        });
    });

    it('POST /api/v1/availability - should allow adjacent windows (gap between)', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const windows = {
        windows: [
          { dayOfWeek: 1, startMin: 540, endMin: 719 }, // 9am-11:59am
          { dayOfWeek: 1, startMin: 721, endMin: 1020 }, // 12:01pm-5pm (1 minute gap)
        ],
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: windows,
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const created = JSON.parse(result.payload);
          expect(created.length).toBe(2);
        });
    });

    it('POST /api/v1/availability - should detect overlap among multiple windows', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const windows = {
        windows: [
          { dayOfWeek: 1, startMin: 360, endMin: 540 }, // 6am-9am (OK)
          { dayOfWeek: 1, startMin: 600, endMin: 900 }, // 10am-3pm (OK)
          { dayOfWeek: 1, startMin: 720, endMin: 1020 }, // 12pm-5pm (overlaps with 10am-3pm)
        ],
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: windows,
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
          const error = JSON.parse(result.payload);
          expect(error.message).toContain('Overlapping');
        });
    });
  });

  // ============================================================================
  // TIME RANGE VALIDATION
  // ============================================================================

  describe('Time Range Validation', () => {
    it('POST /api/v1/availability - should reject when startMin >= endMin', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const windows = {
        windows: [
          {
            dayOfWeek: 1,
            startMin: 1020,
            endMin: 540, // Start after end
          },
        ],
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: windows,
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
          const error = JSON.parse(result.payload);
          expect(error.message).toContain('start');
          expect(error.message).toContain('end');
        });
    });

    it('POST /api/v1/availability - should reject when startMin equals endMin', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const windows = {
        windows: [
          {
            dayOfWeek: 1,
            startMin: 720,
            endMin: 720, // Same time
          },
        ],
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: windows,
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
        });
    });

    it('POST /api/v1/availability - should reject invalid day of week (negative)', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const windows = {
        windows: [
          {
            dayOfWeek: -1, // Invalid
            startMin: 540,
            endMin: 1020,
          },
        ],
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: windows,
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
        });
    });

    it('POST /api/v1/availability - should reject invalid day of week (too high)', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const windows = {
        windows: [
          {
            dayOfWeek: 7, // Invalid (max is 6)
            startMin: 540,
            endMin: 1020,
          },
        ],
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: windows,
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
        });
    });

    it('POST /api/v1/availability - should reject invalid startMin (negative)', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const windows = {
        windows: [
          {
            dayOfWeek: 1,
            startMin: -1, // Invalid
            endMin: 1020,
          },
        ],
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: windows,
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
        });
    });

    it('POST /api/v1/availability - should reject invalid endMin (too high)', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const windows = {
        windows: [
          {
            dayOfWeek: 1,
            startMin: 540,
            endMin: 1440, // Invalid (max is 1439)
          },
        ],
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: windows,
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
        });
    });
  });

  // ============================================================================
  // PRIORITY HANDLING AND EDGE CASES
  // ============================================================================

  describe('Priority Handling', () => {
    it('POST /api/v1/availability - should accept priority 0', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const windows = {
        windows: [
          {
            dayOfWeek: 1,
            startMin: 540,
            endMin: 1020,
            priority: 0,
          },
        ],
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: windows,
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const created = JSON.parse(result.payload);
          expect(created[0].priority).toBe(0);
        });
    });

    it('POST /api/v1/availability - should accept priority 10 (max)', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const windows = {
        windows: [
          {
            dayOfWeek: 1,
            startMin: 540,
            endMin: 1020,
            priority: 10,
          },
        ],
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: windows,
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const created = JSON.parse(result.payload);
          expect(created[0].priority).toBe(10);
        });
    });

    it('POST /api/v1/availability - should reject negative priority', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const windows = {
        windows: [
          {
            dayOfWeek: 1,
            startMin: 540,
            endMin: 1020,
            priority: -1,
          },
        ],
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: windows,
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
        });
    });

    it('POST /api/v1/availability - should reject priority > 10', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const windows = {
        windows: [
          {
            dayOfWeek: 1,
            startMin: 540,
            endMin: 1020,
            priority: 11,
          },
        ],
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: windows,
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
        });
    });

    it('POST /api/v1/availability - should allow different priorities on same day', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const windows = {
        windows: [
          { dayOfWeek: 1, startMin: 360, endMin: 540, priority: 0 }, // Morning: low priority
          { dayOfWeek: 1, startMin: 1080, endMin: 1260, priority: 10 }, // Evening: high priority
        ],
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: windows,
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const created = JSON.parse(result.payload);

          const morning = created.find((w: any) => w.startMin === 360);
          const evening = created.find((w: any) => w.startMin === 1080);

          expect(morning.priority).toBe(0);
          expect(evening.priority).toBe(10);
        });
    });

    it('POST /api/v1/availability - should handle mixed priorities across week', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const windows = {
        windows: [
          { dayOfWeek: 1, startMin: 540, endMin: 1020, priority: 10 }, // Monday: highest
          { dayOfWeek: 2, startMin: 540, endMin: 1020, priority: 5 }, // Tuesday: medium
          { dayOfWeek: 3, startMin: 540, endMin: 1020, priority: 0 }, // Wednesday: lowest
          { dayOfWeek: 4, startMin: 540, endMin: 1020 }, // Thursday: default (0)
        ],
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: windows,
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const created = JSON.parse(result.payload);

          expect(created.length).toBe(4);

          const priorities = created.map((w: any) => ({
            day: w.dayOfWeek,
            priority: w.priority,
          }));

          expect(priorities).toContainEqual({ day: 1, priority: 10 });
          expect(priorities).toContainEqual({ day: 2, priority: 5 });
          expect(priorities).toContainEqual({ day: 3, priority: 0 });
          expect(priorities).toContainEqual({ day: 4, priority: 0 });
        });
    });
  });

  // ============================================================================
  // EDGE CASES AND ERROR HANDLING
  // ============================================================================

  describe('Edge Cases', () => {
    it('POST /api/v1/availability - should reject non-array windows', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            windows: 'not-an-array',
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
        });
    });

    it('POST /api/v1/availability - should reject missing windows field', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {},
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
        });
    });

    it('POST /api/v1/availability - should reject window with missing required fields', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const windows = {
        windows: [
          {
            dayOfWeek: 1,
            // Missing startMin and endMin
          },
        ],
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: windows,
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
        });
    });

    it('POST /api/v1/availability - should handle very short availability window (1 minute)', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const windows = {
        windows: [
          {
            dayOfWeek: 1,
            startMin: 720,
            endMin: 721, // Just 1 minute
            priority: 1,
          },
        ],
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: windows,
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const created = JSON.parse(result.payload);
          expect(created[0].endMin - created[0].startMin).toBe(1);
        });
    });

    it('POST /api/v1/availability - should handle maximum number of windows', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      // Create 21 windows (3 per day for 7 days)
      const windows = {
        windows: Array.from({ length: 21 }, (_, i) => ({
          dayOfWeek: Math.floor(i / 3),
          startMin: (i % 3) * 480, // 0, 480, 960 (non-overlapping)
          endMin: (i % 3) * 480 + 360,
          priority: i % 3,
        })),
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/availability',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: windows,
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const created = JSON.parse(result.payload);
          expect(created.length).toBe(21);
        });
    });
  });
});
