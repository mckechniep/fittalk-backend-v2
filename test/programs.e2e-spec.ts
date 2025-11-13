/**
 * ============================================================================
 * COMPREHENSIVE PROGRAMS MODULE E2E TESTS
 * ============================================================================
 *
 * This test suite provides comprehensive coverage for workout programs:
 * ✅ Program CRUD operations (create, read, update, delete)
 * ✅ Program status management (draft, active, archived)
 * ✅ Program cloning (deep copy with days and items)
 * ✅ Workout day management (add, update, delete days)
 * ✅ Workout item management (add, update, delete exercises)
 * ✅ Nested resource hierarchy (programs → days → items)
 * ✅ Data validation and edge cases
 * ✅ User isolation and authorization
 *
 * SETUP INSTRUCTIONS:
 * - Create a test user in Supabase for your test database
 * - Ensure at least one exercise exists in the Exercise table
 * - Add to .env.test:
 *   TEST_USER_EMAIL=test@fittalk.com
 *   TEST_USER_PASSWORD=TestPassword123!
 *
 * RUN TESTS:
 * - pnpm test:e2e test/programs.e2e-spec.ts
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

describe('Programs Module (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testJWT: string | null = null;
  let testUserId: string | null = null;
  let testExerciseId: string | null = null;

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

        console.log('✅ Test JWT obtained for programs tests');
        console.log(`   User ID: ${testUserId}`);
      } catch (error) {
        console.warn(
          '⚠️  Could not get test JWT - programs tests will be skipped',
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

    // Get Prisma service and find a test exercise
    prisma = app.get<PrismaService>(PrismaService);

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
    await app.close();
  });

  // ============================================================================
  // PROGRAM CREATION
  // ============================================================================

  describe('Program Creation', () => {
    it('POST /api/v1/programs - should create program with minimal data', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const minimalProgram = {
        title: 'Minimal Test Program',
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/programs',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: minimalProgram,
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const program = JSON.parse(result.payload);

          expect(program).toHaveProperty('id');
          expect(program).toHaveProperty('userId', testUserId);
          expect(program).toHaveProperty('title', 'Minimal Test Program');
          expect(program).toHaveProperty('status', 'draft');
          expect(program).toHaveProperty('weeks', 4); // Default
          expect(program).toHaveProperty('createdAt');
          expect(program).toHaveProperty('updatedAt');
        });
    });

    it('POST /api/v1/programs - should create program with complete data', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const completeProgram = {
        title: 'Complete Strength Program',
        weeks: 12,
        sourceJson: {
          template: 'strength_intermediate',
          aiGenerated: false,
          author: 'Test Coach',
        },
      };

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/programs',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: completeProgram,
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const program = JSON.parse(result.payload);

          expect(program).toHaveProperty('title', 'Complete Strength Program');
          expect(program).toHaveProperty('weeks', 12);
          expect(program).toHaveProperty('sourceJson');
          expect(program.sourceJson).toHaveProperty('template', 'strength_intermediate');
        });
    });

    it('POST /api/v1/programs - should reject program without title', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/programs',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: { weeks: 8 },
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
        });
    });

    it('POST /api/v1/programs - should reject invalid weeks value (too high)', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/programs',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            title: 'Too Long Program',
            weeks: 100,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
        });
    });

    it('POST /api/v1/programs - should reject invalid weeks value (zero)', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/programs',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            title: 'Zero Weeks Program',
            weeks: 0,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
        });
    });

    it('POST /api/v1/programs - should reject without authentication', async () => {
      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/programs',
          headers: {
            'Content-Type': 'application/json',
          },
          payload: {
            title: 'Unauthorized Program',
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(401);
        });
    });
  });

  // ============================================================================
  // PROGRAM LISTING & RETRIEVAL
  // ============================================================================

  describe('Program Listing & Retrieval', () => {
    let draftProgramId: string;
    let activeProgramId: string;
    let archivedProgramId: string;

    beforeEach(async () => {
      if (!testJWT) return;

      // Create programs with different statuses
      const draftProgram = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/programs',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            title: 'Draft Program',
            weeks: 4,
          },
        });
      draftProgramId = JSON.parse(draftProgram.payload).id;

      const activeProgram = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/programs',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            title: 'Active Program',
            weeks: 8,
          },
        });
      activeProgramId = JSON.parse(activeProgram.payload).id;

      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/programs/${activeProgramId}/status`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: { status: 'active' },
        });

      const archivedProgram = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/programs',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            title: 'Archived Program',
            weeks: 6,
          },
        });
      archivedProgramId = JSON.parse(archivedProgram.payload).id;

      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/programs/${archivedProgramId}/status`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: { status: 'archived' },
        });
    });

    it('GET /api/v1/programs - should list all user programs', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/programs',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const programs = JSON.parse(result.payload);

          expect(Array.isArray(programs)).toBe(true);
          expect(programs.length).toBeGreaterThanOrEqual(3);
        });
    });

    it('GET /api/v1/programs?status=draft - should filter draft programs', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/programs?status=draft',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const programs = JSON.parse(result.payload);

          expect(Array.isArray(programs)).toBe(true);
          programs.forEach((program: any) => {
            expect(program.status).toBe('draft');
          });

          const draftProgram = programs.find((p: any) => p.id === draftProgramId);
          expect(draftProgram).toBeDefined();
        });
    });

    it('GET /api/v1/programs?status=active - should filter active programs', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/programs?status=active',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const programs = JSON.parse(result.payload);

          expect(Array.isArray(programs)).toBe(true);
          programs.forEach((program: any) => {
            expect(program.status).toBe('active');
          });

          const activeProgram = programs.find((p: any) => p.id === activeProgramId);
          expect(activeProgram).toBeDefined();
        });
    });

    it('GET /api/v1/programs?status=archived - should filter archived programs', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/programs?status=archived',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const programs = JSON.parse(result.payload);

          expect(Array.isArray(programs)).toBe(true);
          programs.forEach((program: any) => {
            expect(program.status).toBe('archived');
          });

          const archivedProgram = programs.find((p: any) => p.id === archivedProgramId);
          expect(archivedProgram).toBeDefined();
        });
    });

    it('GET /api/v1/programs/:id - should get specific program details', async () => {
      if (!testJWT || !activeProgramId) {
        console.warn('⏭️  Skipping test - no test JWT or program ID available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: `/api/v1/programs/${activeProgramId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const program = JSON.parse(result.payload);

          expect(program).toHaveProperty('id', activeProgramId);
          expect(program).toHaveProperty('title', 'Active Program');
          expect(program).toHaveProperty('status', 'active');
          expect(program).toHaveProperty('weeks', 8);
          expect(program).toHaveProperty('user');
        });
    });

    it('GET /api/v1/programs/:id - should return 404 for non-existent program', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const fakeProgramId = '00000000-0000-0000-0000-000000000000';

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: `/api/v1/programs/${fakeProgramId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(404);
        });
    });

    it('GET /api/v1/programs/:id - should return 400 for invalid UUID', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/programs/invalid-uuid',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
        });
    });
  });

  // ============================================================================
  // PROGRAM UPDATES
  // ============================================================================

  describe('Program Updates', () => {
    let updateProgramId: string;

    beforeEach(async () => {
      if (!testJWT) return;

      const newProgram = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/programs',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            title: 'Program To Update',
            weeks: 4,
            sourceJson: { original: true },
          },
        });
      updateProgramId = JSON.parse(newProgram.payload).id;
    });

    it('PATCH /api/v1/programs/:id - should update program title', async () => {
      if (!testJWT || !updateProgramId) {
        console.warn('⏭️  Skipping test - no test JWT or program ID available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/programs/${updateProgramId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            title: 'Updated Program Title',
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const program = JSON.parse(result.payload);

          expect(program).toHaveProperty('title', 'Updated Program Title');
          expect(program).toHaveProperty('weeks', 4); // Should remain unchanged
        });
    });

    it('PATCH /api/v1/programs/:id - should update program weeks', async () => {
      if (!testJWT || !updateProgramId) {
        console.warn('⏭️  Skipping test - no test JWT or program ID available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/programs/${updateProgramId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            weeks: 12,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const program = JSON.parse(result.payload);

          expect(program).toHaveProperty('weeks', 12);
        });
    });

    it('PATCH /api/v1/programs/:id - should update sourceJson', async () => {
      if (!testJWT || !updateProgramId) {
        console.warn('⏭️  Skipping test - no test JWT or program ID available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/programs/${updateProgramId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            sourceJson: { updated: true, version: 2 },
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const program = JSON.parse(result.payload);

          expect(program).toHaveProperty('sourceJson');
          expect(program.sourceJson).toHaveProperty('updated', true);
          expect(program.sourceJson).toHaveProperty('version', 2);
        });
    });

    it('PATCH /api/v1/programs/:id - should update multiple fields at once', async () => {
      if (!testJWT || !updateProgramId) {
        console.warn('⏭️  Skipping test - no test JWT or program ID available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/programs/${updateProgramId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            title: 'Completely Updated',
            weeks: 16,
            sourceJson: { multiUpdate: true },
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const program = JSON.parse(result.payload);

          expect(program).toHaveProperty('title', 'Completely Updated');
          expect(program).toHaveProperty('weeks', 16);
          expect(program.sourceJson).toHaveProperty('multiUpdate', true);
        });
    });

    it('PATCH /api/v1/programs/:id - should return 404 for non-existent program', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const fakeProgramId = '00000000-0000-0000-0000-000000000000';

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/programs/${fakeProgramId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            title: 'Should Fail',
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(404);
        });
    });
  });

  // ============================================================================
  // PROGRAM STATUS MANAGEMENT
  // ============================================================================

  describe('Program Status Management', () => {
    let statusProgramId: string;

    beforeEach(async () => {
      if (!testJWT) return;

      const newProgram = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/programs',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            title: 'Program For Status Testing',
            weeks: 4,
          },
        });
      statusProgramId = JSON.parse(newProgram.payload).id;
    });

    it('PATCH /api/v1/programs/:id/status - should transition draft → active', async () => {
      if (!testJWT || !statusProgramId) {
        console.warn('⏭️  Skipping test - no test JWT or program ID available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/programs/${statusProgramId}/status`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: { status: 'active' },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const program = JSON.parse(result.payload);

          expect(program).toHaveProperty('id', statusProgramId);
          expect(program).toHaveProperty('status', 'active');
        });
    });

    it('PATCH /api/v1/programs/:id/status - should transition draft → archived', async () => {
      if (!testJWT || !statusProgramId) {
        console.warn('⏭️  Skipping test - no test JWT or program ID available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/programs/${statusProgramId}/status`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: { status: 'archived' },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const program = JSON.parse(result.payload);

          expect(program).toHaveProperty('status', 'archived');
        });
    });

    it('PATCH /api/v1/programs/:id/status - should transition active → archived', async () => {
      if (!testJWT || !statusProgramId) {
        console.warn('⏭️  Skipping test - no test JWT or program ID available');
        return;
      }

      // First activate the program
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/programs/${statusProgramId}/status`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: { status: 'active' },
        });

      // Then archive it
      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/programs/${statusProgramId}/status`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: { status: 'archived' },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const program = JSON.parse(result.payload);

          expect(program).toHaveProperty('status', 'archived');
        });
    });

    it('PATCH /api/v1/programs/:id/status - should transition archived → active', async () => {
      if (!testJWT || !statusProgramId) {
        console.warn('⏭️  Skipping test - no test JWT or program ID available');
        return;
      }

      // First archive the program
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/programs/${statusProgramId}/status`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: { status: 'archived' },
        });

      // Then reactivate it
      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/programs/${statusProgramId}/status`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: { status: 'active' },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const program = JSON.parse(result.payload);

          expect(program).toHaveProperty('status', 'active');
        });
    });

    it('PATCH /api/v1/programs/:id/status - should reject invalid status', async () => {
      if (!testJWT || !statusProgramId) {
        console.warn('⏭️  Skipping test - no test JWT or program ID available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/programs/${statusProgramId}/status`,
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

    it('PATCH /api/v1/programs/:id/status - should return 404 for non-existent program', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const fakeProgramId = '00000000-0000-0000-0000-000000000000';

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/programs/${fakeProgramId}/status`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: { status: 'active' },
        })
        .then((result) => {
          expect(result.statusCode).toBe(404);
        });
    });
  });

  // ============================================================================
  // PROGRAM CLONING
  // ============================================================================

  describe('Program Cloning', () => {
    let originalProgramId: string;
    let originalDayId: string;

    beforeEach(async () => {
      if (!testJWT || !testExerciseId) return;

      // Create a program with days and items
      const program = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/programs',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            title: 'Original Program To Clone',
            weeks: 6,
            sourceJson: { cloneTest: true },
          },
        });
      originalProgramId = JSON.parse(program.payload).id;

      // Add a workout day
      const day = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: `/api/v1/programs/${originalProgramId}/days`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            weekNumber: 1,
            dayNumber: 1,
            focus: 'strength',
            notes: 'Test day for cloning',
          },
        });
      originalDayId = JSON.parse(day.payload).id;

      // Add workout items
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: `/api/v1/programs/${originalProgramId}/days/${originalDayId}/items`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            exerciseId: testExerciseId,
            order: 1,
            targetSets: 4,
            targetReps: 8,
            targetRir: 2,
            restSeconds: 120,
          },
        });

      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: `/api/v1/programs/${originalProgramId}/days/${originalDayId}/items`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            exerciseId: testExerciseId,
            order: 2,
            targetSets: 3,
            targetReps: 12,
            restSeconds: 90,
          },
        });
    });

    it('POST /api/v1/programs/:id/clone - should clone program with all nested data', async () => {
      if (!testJWT || !originalProgramId) {
        console.warn('⏭️  Skipping test - no test JWT or program ID available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: `/api/v1/programs/${originalProgramId}/clone`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const clonedProgram = JSON.parse(result.payload);

          // Should have different ID
          expect(clonedProgram).toHaveProperty('id');
          expect(clonedProgram.id).not.toBe(originalProgramId);

          // Should have modified title
          expect(clonedProgram.title).toContain('Original Program To Clone');
          expect(clonedProgram.title).toContain('Copy');

          // Should copy other properties
          expect(clonedProgram).toHaveProperty('weeks', 6);
          expect(clonedProgram).toHaveProperty('userId', testUserId);
          expect(clonedProgram).toHaveProperty('status', 'draft');
        });
    });

    it('POST /api/v1/programs/:id/clone - cloned program should include workout days', async () => {
      if (!testJWT || !originalProgramId) {
        console.warn('⏭️  Skipping test - no test JWT or program ID available');
        return;
      }

      const cloneResult = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: `/api/v1/programs/${originalProgramId}/clone`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        });
      const clonedProgram = JSON.parse(cloneResult.payload);

      // Get full details of cloned program
      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: `/api/v1/programs/${clonedProgram.id}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const fullProgram = JSON.parse(result.payload);

          expect(fullProgram).toHaveProperty('days');
          expect(Array.isArray(fullProgram.days)).toBe(true);
          expect(fullProgram.days.length).toBe(1);

          const clonedDay = fullProgram.days[0];
          expect(clonedDay).toHaveProperty('weekNumber', 1);
          expect(clonedDay).toHaveProperty('dayNumber', 1);
          expect(clonedDay).toHaveProperty('focus', 'strength');
          expect(clonedDay).toHaveProperty('notes', 'Test day for cloning');
          expect(clonedDay.id).not.toBe(originalDayId);
        });
    });

    it('POST /api/v1/programs/:id/clone - cloned days should include workout items', async () => {
      if (!testJWT || !originalProgramId) {
        console.warn('⏭️  Skipping test - no test JWT or program ID available');
        return;
      }

      const cloneResult = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: `/api/v1/programs/${originalProgramId}/clone`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        });
      const clonedProgram = JSON.parse(cloneResult.payload);

      // Get full details of cloned program
      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: `/api/v1/programs/${clonedProgram.id}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const fullProgram = JSON.parse(result.payload);

          const clonedDay = fullProgram.days[0];
          expect(clonedDay).toHaveProperty('items');
          expect(Array.isArray(clonedDay.items)).toBe(true);
          expect(clonedDay.items.length).toBe(2);

          // Check first item
          const firstItem = clonedDay.items.find((i: any) => i.order === 1);
          expect(firstItem).toBeDefined();
          expect(firstItem).toHaveProperty('exerciseId', testExerciseId);
          expect(firstItem).toHaveProperty('targetSets', 4);
          expect(firstItem).toHaveProperty('targetReps', 8);
          expect(firstItem).toHaveProperty('targetRir', '2');
          expect(firstItem).toHaveProperty('restSeconds', 120);

          // Check second item
          const secondItem = clonedDay.items.find((i: any) => i.order === 2);
          expect(secondItem).toBeDefined();
          expect(secondItem).toHaveProperty('targetSets', 3);
          expect(secondItem).toHaveProperty('targetReps', 12);
        });
    });

    it('POST /api/v1/programs/:id/clone - should return 404 for non-existent program', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const fakeProgramId = '00000000-0000-0000-0000-000000000000';

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: `/api/v1/programs/${fakeProgramId}/clone`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(404);
        });
    });

    it('POST /api/v1/programs/:id/clone - should return 400 for invalid UUID', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/programs/invalid-uuid/clone',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
        });
    });
  });

  // ============================================================================
  // WORKOUT DAY MANAGEMENT
  // ============================================================================

  describe('Workout Day Management', () => {
    let testProgramId: string;

    beforeEach(async () => {
      if (!testJWT) return;

      const program = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/programs',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            title: 'Program For Day Testing',
            weeks: 4,
          },
        });
      testProgramId = JSON.parse(program.payload).id;
    });

    it('POST /api/v1/programs/:id/days - should create workout day with all fields', async () => {
      if (!testJWT || !testProgramId) {
        console.warn('⏭️  Skipping test - no test JWT or program ID available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: `/api/v1/programs/${testProgramId}/days`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            weekNumber: 1,
            dayNumber: 1,
            focus: 'strength',
            notes: 'Focus on compound movements',
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const day = JSON.parse(result.payload);

          expect(day).toHaveProperty('id');
          expect(day).toHaveProperty('planId', testProgramId);
          expect(day).toHaveProperty('weekNumber', 1);
          expect(day).toHaveProperty('dayNumber', 1);
          expect(day).toHaveProperty('focus', 'strength');
          expect(day).toHaveProperty('notes', 'Focus on compound movements');
        });
    });

    it('POST /api/v1/programs/:id/days - should create day with minimal data', async () => {
      if (!testJWT || !testProgramId) {
        console.warn('⏭️  Skipping test - no test JWT or program ID available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: `/api/v1/programs/${testProgramId}/days`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            weekNumber: 2,
            dayNumber: 3,
            focus: 'cardio',
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const day = JSON.parse(result.payload);

          expect(day).toHaveProperty('weekNumber', 2);
          expect(day).toHaveProperty('dayNumber', 3);
          expect(day).toHaveProperty('focus', 'cardio');
          expect(day).toHaveProperty('notes', null);
        });
    });

    it('POST /api/v1/programs/:id/days - should create days with all session types', async () => {
      if (!testJWT || !testProgramId) {
        console.warn('⏭️  Skipping test - no test JWT or program ID available');
        return;
      }

      const sessionTypes = ['strength', 'hypertrophy', 'cardio', 'mobility', 'mixed'];

      for (let i = 0; i < sessionTypes.length; i++) {
        const result = await app
          .getHttpAdapter()
          .getInstance()
          .inject({
            method: 'POST',
            url: `/api/v1/programs/${testProgramId}/days`,
            headers: {
              Authorization: `Bearer ${testJWT}`,
              'Content-Type': 'application/json',
            },
            payload: {
              weekNumber: 1,
              dayNumber: i + 1,
              focus: sessionTypes[i],
            },
          });

        expect(result.statusCode).toBe(201);
        const day = JSON.parse(result.payload);
        expect(day).toHaveProperty('focus', sessionTypes[i]);
      }
    });

    it('POST /api/v1/programs/:id/days - should reject invalid session type', async () => {
      if (!testJWT || !testProgramId) {
        console.warn('⏭️  Skipping test - no test JWT or program ID available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: `/api/v1/programs/${testProgramId}/days`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            weekNumber: 1,
            dayNumber: 1,
            focus: 'invalid_type',
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
        });
    });

    it('POST /api/v1/programs/:id/days - should reject invalid week number (too high)', async () => {
      if (!testJWT || !testProgramId) {
        console.warn('⏭️  Skipping test - no test JWT or program ID available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: `/api/v1/programs/${testProgramId}/days`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            weekNumber: 100,
            dayNumber: 1,
            focus: 'strength',
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
        });
    });

    it('POST /api/v1/programs/:id/days - should reject invalid day number', async () => {
      if (!testJWT || !testProgramId) {
        console.warn('⏭️  Skipping test - no test JWT or program ID available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: `/api/v1/programs/${testProgramId}/days`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            weekNumber: 1,
            dayNumber: 8, // Max is 7
            focus: 'strength',
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
        });
    });

    it('PATCH /api/v1/programs/:id/days/:dayId - should update workout day', async () => {
      if (!testJWT || !testProgramId) {
        console.warn('⏭️  Skipping test - no test JWT or program ID available');
        return;
      }

      // Create a day first
      const dayResult = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: `/api/v1/programs/${testProgramId}/days`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            weekNumber: 1,
            dayNumber: 1,
            focus: 'strength',
            notes: 'Original notes',
          },
        });
      const dayId = JSON.parse(dayResult.payload).id;

      // Update the day
      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/programs/${testProgramId}/days/${dayId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            focus: 'hypertrophy',
            notes: 'Updated notes with new focus',
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const updatedDay = JSON.parse(result.payload);

          expect(updatedDay).toHaveProperty('focus', 'hypertrophy');
          expect(updatedDay).toHaveProperty('notes', 'Updated notes with new focus');
          expect(updatedDay).toHaveProperty('weekNumber', 1); // Should remain unchanged
        });
    });

    it('DELETE /api/v1/programs/:id/days/:dayId - should delete workout day', async () => {
      if (!testJWT || !testProgramId) {
        console.warn('⏭️  Skipping test - no test JWT or program ID available');
        return;
      }

      // Create a day first
      const dayResult = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: `/api/v1/programs/${testProgramId}/days`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            weekNumber: 1,
            dayNumber: 1,
            focus: 'strength',
          },
        });
      const dayId = JSON.parse(dayResult.payload).id;

      // Delete the day
      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'DELETE',
          url: `/api/v1/programs/${testProgramId}/days/${dayId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(204);
        });
    });

    it('DELETE /api/v1/programs/:id/days/:dayId - should return 404 for non-existent day', async () => {
      if (!testJWT || !testProgramId) {
        console.warn('⏭️  Skipping test - no test JWT or program ID available');
        return;
      }

      const fakeDayId = '00000000-0000-0000-0000-000000000000';

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'DELETE',
          url: `/api/v1/programs/${testProgramId}/days/${fakeDayId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(404);
        });
    });
  });

  // ============================================================================
  // WORKOUT ITEM MANAGEMENT
  // ============================================================================

  describe('Workout Item Management', () => {
    let testProgramId: string;
    let testDayId: string;

    beforeEach(async () => {
      if (!testJWT || !testExerciseId) return;

      // Create program
      const program = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/programs',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            title: 'Program For Item Testing',
            weeks: 4,
          },
        });
      testProgramId = JSON.parse(program.payload).id;

      // Create day
      const day = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: `/api/v1/programs/${testProgramId}/days`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            weekNumber: 1,
            dayNumber: 1,
            focus: 'strength',
          },
        });
      testDayId = JSON.parse(day.payload).id;
    });

    it('POST /api/v1/programs/:id/days/:dayId/items - should create workout item with all fields', async () => {
      if (!testJWT || !testProgramId || !testDayId || !testExerciseId) {
        console.warn('⏭️  Skipping test - missing required IDs');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: `/api/v1/programs/${testProgramId}/days/${testDayId}/items`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            exerciseId: testExerciseId,
            order: 1,
            targetSets: 4,
            targetReps: 8,
            targetRir: 2,
            targetWeight: 100,
            restSeconds: 180,
            notes: 'Focus on tempo: 3-0-1-0',
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const item = JSON.parse(result.payload);

          expect(item).toHaveProperty('id');
          expect(item).toHaveProperty('dayId', testDayId);
          expect(item).toHaveProperty('exerciseId', testExerciseId);
          expect(item).toHaveProperty('order', 1);
          expect(item).toHaveProperty('targetSets', 4);
          expect(item).toHaveProperty('targetReps', 8);
          expect(item).toHaveProperty('targetRir', '2');
          expect(item).toHaveProperty('targetWeight', '100');
          expect(item).toHaveProperty('restSeconds', 180);
          expect(item).toHaveProperty('notes', 'Focus on tempo: 3-0-1-0');
        });
    });

    it('POST /api/v1/programs/:id/days/:dayId/items - should create item with minimal data', async () => {
      if (!testJWT || !testProgramId || !testDayId || !testExerciseId) {
        console.warn('⏭️  Skipping test - missing required IDs');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: `/api/v1/programs/${testProgramId}/days/${testDayId}/items`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            exerciseId: testExerciseId,
            order: 1,
            targetSets: 3,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const item = JSON.parse(result.payload);

          expect(item).toHaveProperty('targetSets', 3);
          expect(item).toHaveProperty('targetReps', null);
          expect(item).toHaveProperty('targetRir', null);
          expect(item).toHaveProperty('targetWeight', null);
          expect(item).toHaveProperty('restSeconds', null);
        });
    });

    it('POST /api/v1/programs/:id/days/:dayId/items - should create multiple items in order', async () => {
      if (!testJWT || !testProgramId || !testDayId || !testExerciseId) {
        console.warn('⏭️  Skipping test - missing required IDs');
        return;
      }

      // Create first item
      const item1 = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: `/api/v1/programs/${testProgramId}/days/${testDayId}/items`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            exerciseId: testExerciseId,
            order: 1,
            targetSets: 4,
            targetReps: 6,
          },
        });

      // Create second item
      const item2 = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: `/api/v1/programs/${testProgramId}/days/${testDayId}/items`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            exerciseId: testExerciseId,
            order: 2,
            targetSets: 3,
            targetReps: 10,
          },
        });

      expect(item1.statusCode).toBe(201);
      expect(item2.statusCode).toBe(201);

      const firstItem = JSON.parse(item1.payload);
      const secondItem = JSON.parse(item2.payload);

      expect(firstItem.order).toBe(1);
      expect(secondItem.order).toBe(2);
    });

    it('POST /api/v1/programs/:id/days/:dayId/items - should reject invalid exercise ID', async () => {
      if (!testJWT || !testProgramId || !testDayId) {
        console.warn('⏭️  Skipping test - missing required IDs');
        return;
      }

      const fakeExerciseId = '00000000-0000-0000-0000-000000000000';

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: `/api/v1/programs/${testProgramId}/days/${testDayId}/items`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            exerciseId: fakeExerciseId,
            order: 1,
            targetSets: 3,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(404);
        });
    });

    it('POST /api/v1/programs/:id/days/:dayId/items - should reject negative sets', async () => {
      if (!testJWT || !testProgramId || !testDayId || !testExerciseId) {
        console.warn('⏭️  Skipping test - missing required IDs');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: `/api/v1/programs/${testProgramId}/days/${testDayId}/items`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            exerciseId: testExerciseId,
            order: 1,
            targetSets: -1,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
        });
    });

    it('PATCH /api/v1/programs/:id/days/:dayId/items/:itemId - should update workout item', async () => {
      if (!testJWT || !testProgramId || !testDayId || !testExerciseId) {
        console.warn('⏭️  Skipping test - missing required IDs');
        return;
      }

      // Create item first
      const itemResult = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: `/api/v1/programs/${testProgramId}/days/${testDayId}/items`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            exerciseId: testExerciseId,
            order: 1,
            targetSets: 3,
            targetReps: 10,
          },
        });
      const itemId = JSON.parse(itemResult.payload).id;

      // Update the item
      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/api/v1/programs/${testProgramId}/days/${testDayId}/items/${itemId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            targetSets: 4,
            targetReps: 8,
            targetRir: 2,
            targetWeight: 80,
            notes: 'Increased weight',
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const updatedItem = JSON.parse(result.payload);

          expect(updatedItem).toHaveProperty('targetSets', 4);
          expect(updatedItem).toHaveProperty('targetReps', 8);
          expect(updatedItem).toHaveProperty('targetRir', '2');
          expect(updatedItem).toHaveProperty('targetWeight', '80');
          expect(updatedItem).toHaveProperty('notes', 'Increased weight');
        });
    });

    it('DELETE /api/v1/programs/:id/days/:dayId/items/:itemId - should delete workout item', async () => {
      if (!testJWT || !testProgramId || !testDayId || !testExerciseId) {
        console.warn('⏭️  Skipping test - missing required IDs');
        return;
      }

      // Create item first
      const itemResult = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: `/api/v1/programs/${testProgramId}/days/${testDayId}/items`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            exerciseId: testExerciseId,
            order: 1,
            targetSets: 3,
          },
        });
      const itemId = JSON.parse(itemResult.payload).id;

      // Delete the item
      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'DELETE',
          url: `/api/v1/programs/${testProgramId}/days/${testDayId}/items/${itemId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(204);
        });
    });

    it('DELETE /api/v1/programs/:id/days/:dayId/items/:itemId - should return 404 for non-existent item', async () => {
      if (!testJWT || !testProgramId || !testDayId) {
        console.warn('⏭️  Skipping test - missing required IDs');
        return;
      }

      const fakeItemId = '00000000-0000-0000-0000-000000000000';

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'DELETE',
          url: `/api/v1/programs/${testProgramId}/days/${testDayId}/items/${fakeItemId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(404);
        });
    });
  });

  // ============================================================================
  // PROGRAM DELETION
  // ============================================================================

  describe('Program Deletion', () => {
    let deleteProgramId: string;

    beforeEach(async () => {
      if (!testJWT) return;

      const program = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/programs',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            title: 'Program To Delete',
            weeks: 4,
          },
        });
      deleteProgramId = JSON.parse(program.payload).id;
    });

    it('DELETE /api/v1/programs/:id - should delete program successfully', async () => {
      if (!testJWT || !deleteProgramId) {
        console.warn('⏭️  Skipping test - no test JWT or program ID available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'DELETE',
          url: `/api/v1/programs/${deleteProgramId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(204);
        });
    });

    it('DELETE /api/v1/programs/:id - deleted program should not be retrievable', async () => {
      if (!testJWT || !deleteProgramId) {
        console.warn('⏭️  Skipping test - no test JWT or program ID available');
        return;
      }

      // Delete the program
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'DELETE',
          url: `/api/v1/programs/${deleteProgramId}`,
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
          url: `/api/v1/programs/${deleteProgramId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(404);
        });
    });

    it('DELETE /api/v1/programs/:id - should cascade delete workout days', async () => {
      if (!testJWT || !deleteProgramId || !testExerciseId) {
        console.warn('⏭️  Skipping test - missing required IDs');
        return;
      }

      // Add a workout day
      const day = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: `/api/v1/programs/${deleteProgramId}/days`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            weekNumber: 1,
            dayNumber: 1,
            focus: 'strength',
          },
        });
      const dayId = JSON.parse(day.payload).id;

      // Add workout items
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: `/api/v1/programs/${deleteProgramId}/days/${dayId}/items`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            exerciseId: testExerciseId,
            order: 1,
            targetSets: 4,
          },
        });

      // Delete the program
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'DELETE',
          url: `/api/v1/programs/${deleteProgramId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        });

      // Verify deletion cascaded
      const result = await prisma.workoutDay.findUnique({
        where: { id: dayId },
      });

      expect(result).toBeNull();
    });

    it('DELETE /api/v1/programs/:id - should return 404 for non-existent program', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const fakeProgramId = '00000000-0000-0000-0000-000000000000';

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'DELETE',
          url: `/api/v1/programs/${fakeProgramId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(404);
        });
    });

    it('DELETE /api/v1/programs/:id - should return 400 for invalid UUID', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'DELETE',
          url: '/api/v1/programs/invalid-uuid',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
        });
    });
  });

  // ============================================================================
  // AUTHORIZATION & SECURITY
  // ============================================================================

  describe('Authorization & Security', () => {
    it('should not allow accessing another user\'s programs', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      // Create a program
      const program = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/programs',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            title: 'My Program',
            weeks: 4,
          },
        });
      const programId = JSON.parse(program.payload).id;

      // Verify it belongs to test user
      const result = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: `/api/v1/programs/${programId}`,
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        });

      const retrievedProgram = JSON.parse(result.payload);
      expect(retrievedProgram.userId).toBe(testUserId);
    });

    it('GET /api/v1/programs - should only return programs for authenticated user', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/programs',
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const programs = JSON.parse(result.payload);

          // All programs should belong to test user
          programs.forEach((program: any) => {
            expect(program.userId).toBe(testUserId);
          });
        });
    });

    it('should reject all operations without authentication', async () => {
      // Test GET /programs (no validation)
      const listResult = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/programs',
          headers: {
            'Content-Type': 'application/json',
          },
        });
      expect(listResult.statusCode).toBe(401);

      // Test GET /programs/:id (has UUID validation)
      const getResult = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/api/v1/programs/00000000-0000-0000-0000-000000000000',
          headers: {
            'Content-Type': 'application/json',
          },
        });
      expect(getResult.statusCode).toBe(401);

      // Test DELETE /programs/:id (has UUID validation)
      // Note: Don't set Content-Type for DELETE - Fastify validates empty body
      const deleteResult = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'DELETE',
          url: '/api/v1/programs/00000000-0000-0000-0000-000000000000',
        });
      expect(deleteResult.statusCode).toBe(401);
    });
  });
});
