/**
 * ============================================================================
 * COMPREHENSIVE PROFILE MODULE E2E TESTS
 * ============================================================================
 *
 * This test suite provides comprehensive coverage for profile management:
 * ✅ Profile creation with various data combinations
 * ✅ Profile validation (height, weight, experience level)
 * ✅ Goal type transitions (changing goals)
 * ✅ Unit system conversions (metric ↔ imperial)
 * ✅ Profile updates and partial updates
 * ✅ Data validation and edge cases
 *
 * SETUP INSTRUCTIONS:
 * - Create a test user in Supabase for your test database
 * - Add to .env.test:
 *   TEST_USER_EMAIL=test@fittalk.com
 *   TEST_USER_PASSWORD=TestPassword123!
 *
 * RUN TESTS:
 * - pnpm test:e2e test/profile.e2e-spec.ts
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

describe('Profile Module (e2e)', () => {
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

        console.log('✅ Test JWT obtained for profile tests');
        console.log(`   User ID: ${testUserId}`);
      } catch (error) {
        console.warn(
          '⚠️  Could not get test JWT - profile tests will be skipped',
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
  // PROFILE CREATION
  // ============================================================================

  describe('Profile Creation', () => {
    it('POST /api/v1/auth/profile - should create profile with minimal required data', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const minimalProfile = {
        firstname: 'John',
        lastname: 'Doe',
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
          payload: minimalProfile,
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const profile = JSON.parse(result.payload);

          expect(profile).toHaveProperty('userId', testUserId);
          expect(profile).toHaveProperty('firstname', 'John');
          expect(profile).toHaveProperty('lastname', 'Doe');
          expect(profile).toHaveProperty('createdAt');
          expect(profile).toHaveProperty('updatedAt');
        });
    });

    it('POST /api/v1/auth/profile - should create profile with complete data (metric)', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const completeProfile = {
        firstname: 'Jane',
        lastname: 'Smith',
        sex: 'female',
        heightCm: 165,
        weightKg: 60.5,
        experienceLevel: 'intermediate',
        goalType: 'fat_loss',
        unitSystem: 'metric',
        healthNotes: 'No known health issues',
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
          payload: completeProfile,
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const profile = JSON.parse(result.payload);

          expect(profile).toHaveProperty('firstname', 'Jane');
          expect(profile).toHaveProperty('lastname', 'Smith');
          expect(profile).toHaveProperty('sex', 'female');
          expect(profile).toHaveProperty('heightCm', 165);
          expect(profile).toHaveProperty('weightKg', '60.5');
          expect(profile).toHaveProperty('experienceLevel', 'intermediate');
          expect(profile).toHaveProperty('goalType', 'fat_loss');
          expect(profile).toHaveProperty('unitSystem', 'metric');
          expect(profile).toHaveProperty('healthNotes', 'No known health issues');
        });
    });

    it('POST /api/v1/auth/profile - should create profile with imperial unit system', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const imperialProfile = {
        firstname: 'Mike',
        lastname: 'Johnson',
        sex: 'male',
        heightCm: 183, // ~6 feet
        weightKg: 90.7, // ~200 lbs
        experienceLevel: 'advanced',
        goalType: 'muscle_gain',
        unitSystem: 'imperial',
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
          payload: imperialProfile,
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const profile = JSON.parse(result.payload);

          expect(profile).toHaveProperty('unitSystem', 'imperial');
          expect(profile).toHaveProperty('heightCm', 183);
          expect(profile).toHaveProperty('weightKg', '90.7');
        });
    });

    it('POST /api/v1/auth/profile - should create profile for beginner with fat_loss goal', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const beginnerProfile = {
        firstname: 'Sarah',
        lastname: 'Williams',
        sex: 'female',
        heightCm: 170,
        weightKg: 75.0,
        experienceLevel: 'beginner',
        goalType: 'fat_loss',
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
          payload: beginnerProfile,
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const profile = JSON.parse(result.payload);

          expect(profile).toHaveProperty('experienceLevel', 'beginner');
          expect(profile).toHaveProperty('goalType', 'fat_loss');
        });
    });

    it('POST /api/v1/auth/profile - should create profile for elite athlete', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const eliteProfile = {
        firstname: 'Alex',
        lastname: 'Thompson',
        sex: 'other',
        heightCm: 175,
        weightKg: 72.5,
        experienceLevel: 'elite',
        goalType: 'performance',
        unitSystem: 'metric',
        healthNotes: 'Professional athlete - competitive cycling',
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
          payload: eliteProfile,
        })
        .then((result) => {
          expect(result.statusCode).toBe(201);
          const profile = JSON.parse(result.payload);

          expect(profile).toHaveProperty('experienceLevel', 'elite');
          expect(profile).toHaveProperty('goalType', 'performance');
          expect(profile).toHaveProperty('sex', 'other');
        });
    });
  });

  // ============================================================================
  // PROFILE VALIDATION
  // ============================================================================

  describe('Profile Validation', () => {
    describe('Height Validation', () => {
      it('POST /api/v1/auth/profile - should accept minimum valid height (100cm)', async () => {
        if (!testJWT) {
          console.warn('⏭️  Skipping test - no test JWT available');
          return;
        }

        const profile = {
          firstname: 'Test',
          lastname: 'User',
          heightCm: 100,
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
            payload: profile,
          })
          .then((result) => {
            expect(result.statusCode).toBe(201);
            const responseProfile = JSON.parse(result.payload);
            expect(responseProfile).toHaveProperty('heightCm', 100);
          });
      });

      it('POST /api/v1/auth/profile - should accept maximum valid height (250cm)', async () => {
        if (!testJWT) {
          console.warn('⏭️  Skipping test - no test JWT available');
          return;
        }

        const profile = {
          firstname: 'Test',
          lastname: 'User',
          heightCm: 250,
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
            payload: profile,
          })
          .then((result) => {
            expect(result.statusCode).toBe(201);
            const responseProfile = JSON.parse(result.payload);
            expect(responseProfile).toHaveProperty('heightCm', 250);
          });
      });

      it('POST /api/v1/auth/profile - should reject height below minimum (99cm)', async () => {
        if (!testJWT) {
          console.warn('⏭️  Skipping test - no test JWT available');
          return;
        }

        const profile = {
          firstname: 'Test',
          lastname: 'User',
          heightCm: 99,
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
            payload: profile,
          })
          .then((result) => {
            expect(result.statusCode).toBe(400);
          });
      });

      it('POST /api/v1/auth/profile - should reject height above maximum (251cm)', async () => {
        if (!testJWT) {
          console.warn('⏭️  Skipping test - no test JWT available');
          return;
        }

        const profile = {
          firstname: 'Test',
          lastname: 'User',
          heightCm: 251,
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
            payload: profile,
          })
          .then((result) => {
            expect(result.statusCode).toBe(400);
          });
      });

      it('POST /api/v1/auth/profile - should reject negative height', async () => {
        if (!testJWT) {
          console.warn('⏭️  Skipping test - no test JWT available');
          return;
        }

        const profile = {
          firstname: 'Test',
          lastname: 'User',
          heightCm: -170,
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
            payload: profile,
          })
          .then((result) => {
            expect(result.statusCode).toBe(400);
          });
      });
    });

    describe('Weight Validation', () => {
      it('POST /api/v1/auth/profile - should accept minimum valid weight (30kg)', async () => {
        if (!testJWT) {
          console.warn('⏭️  Skipping test - no test JWT available');
          return;
        }

        const profile = {
          firstname: 'Test',
          lastname: 'User',
          weightKg: 30.0,
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
            payload: profile,
          })
          .then((result) => {
            expect(result.statusCode).toBe(201);
            const responseProfile = JSON.parse(result.payload);
            expect(responseProfile).toHaveProperty('weightKg', '30');
          });
      });

      it('POST /api/v1/auth/profile - should accept maximum valid weight (300kg)', async () => {
        if (!testJWT) {
          console.warn('⏭️  Skipping test - no test JWT available');
          return;
        }

        const profile = {
          firstname: 'Test',
          lastname: 'User',
          weightKg: 300.0,
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
            payload: profile,
          })
          .then((result) => {
            expect(result.statusCode).toBe(201);
            const responseProfile = JSON.parse(result.payload);
            expect(responseProfile).toHaveProperty('weightKg', '300');
          });
      });

      it('POST /api/v1/auth/profile - should accept weight with decimal precision', async () => {
        if (!testJWT) {
          console.warn('⏭️  Skipping test - no test JWT available');
          return;
        }

        const profile = {
          firstname: 'Test',
          lastname: 'User',
          weightKg: 75.75,
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
            payload: profile,
          })
          .then((result) => {
            expect(result.statusCode).toBe(201);
            const responseProfile = JSON.parse(result.payload);
            expect(responseProfile).toHaveProperty('weightKg', '75.75');
          });
      });

      it('POST /api/v1/auth/profile - should reject weight below minimum (29.9kg)', async () => {
        if (!testJWT) {
          console.warn('⏭️  Skipping test - no test JWT available');
          return;
        }

        const profile = {
          firstname: 'Test',
          lastname: 'User',
          weightKg: 29.9,
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
            payload: profile,
          })
          .then((result) => {
            expect(result.statusCode).toBe(400);
          });
      });

      it('POST /api/v1/auth/profile - should reject weight above maximum (300.1kg)', async () => {
        if (!testJWT) {
          console.warn('⏭️  Skipping test - no test JWT available');
          return;
        }

        const profile = {
          firstname: 'Test',
          lastname: 'User',
          weightKg: 300.1,
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
            payload: profile,
          })
          .then((result) => {
            expect(result.statusCode).toBe(400);
          });
      });

      it('POST /api/v1/auth/profile - should reject negative weight', async () => {
        if (!testJWT) {
          console.warn('⏭️  Skipping test - no test JWT available');
          return;
        }

        const profile = {
          firstname: 'Test',
          lastname: 'User',
          weightKg: -75.0,
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
            payload: profile,
          })
          .then((result) => {
            expect(result.statusCode).toBe(400);
          });
      });
    });

    describe('Experience Level Validation', () => {
      const experienceLevels = ['beginner', 'novice', 'intermediate', 'advanced', 'elite'];

      experienceLevels.forEach((level) => {
        it(`POST /api/v1/auth/profile - should accept experience level: ${level}`, async () => {
          if (!testJWT) {
            console.warn('⏭️  Skipping test - no test JWT available');
            return;
          }

          const profile = {
            firstname: 'Test',
            lastname: 'User',
            experienceLevel: level,
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
              payload: profile,
            })
            .then((result) => {
              expect(result.statusCode).toBe(201);
              const responseProfile = JSON.parse(result.payload);
              expect(responseProfile).toHaveProperty('experienceLevel', level);
            });
        });
      });

      it('POST /api/v1/auth/profile - should reject invalid experience level', async () => {
        if (!testJWT) {
          console.warn('⏭️  Skipping test - no test JWT available');
          return;
        }

        const profile = {
          firstname: 'Test',
          lastname: 'User',
          experienceLevel: 'expert', // Invalid - not in enum
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
            payload: profile,
          })
          .then((result) => {
            expect(result.statusCode).toBe(400);
          });
      });
    });

    describe('Sex Validation', () => {
      const sexOptions = ['male', 'female', 'other'];

      sexOptions.forEach((sex) => {
        it(`POST /api/v1/auth/profile - should accept sex: ${sex}`, async () => {
          if (!testJWT) {
            console.warn('⏭️  Skipping test - no test JWT available');
            return;
          }

          const profile = {
            firstname: 'Test',
            lastname: 'User',
            sex: sex,
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
              payload: profile,
            })
            .then((result) => {
              expect(result.statusCode).toBe(201);
              const responseProfile = JSON.parse(result.payload);
              expect(responseProfile).toHaveProperty('sex', sex);
            });
        });
      });

      it('POST /api/v1/auth/profile - should reject invalid sex value', async () => {
        if (!testJWT) {
          console.warn('⏭️  Skipping test - no test JWT available');
          return;
        }

        const profile = {
          firstname: 'Test',
          lastname: 'User',
          sex: 'unknown', // Invalid - not in enum
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
            payload: profile,
          })
          .then((result) => {
            expect(result.statusCode).toBe(400);
          });
      });
    });

    describe('Required Fields Validation', () => {
      it('POST /api/v1/auth/profile - should reject when firstname is missing', async () => {
        if (!testJWT) {
          console.warn('⏭️  Skipping test - no test JWT available');
          return;
        }

        const profile = {
          lastname: 'User',
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
            payload: profile,
          })
          .then((result) => {
            expect(result.statusCode).toBe(400);
          });
      });

      it('POST /api/v1/auth/profile - should reject when lastname is missing', async () => {
        if (!testJWT) {
          console.warn('⏭️  Skipping test - no test JWT available');
          return;
        }

        const profile = {
          firstname: 'Test',
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
            payload: profile,
          })
          .then((result) => {
            expect(result.statusCode).toBe(400);
          });
      });

      it('POST /api/v1/auth/profile - should reject empty firstname', async () => {
        if (!testJWT) {
          console.warn('⏭️  Skipping test - no test JWT available');
          return;
        }

        const profile = {
          firstname: '',
          lastname: 'User',
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
            payload: profile,
          })
          .then((result) => {
            expect(result.statusCode).toBe(400);
          });
      });

      it('POST /api/v1/auth/profile - should reject empty lastname', async () => {
        if (!testJWT) {
          console.warn('⏭️  Skipping test - no test JWT available');
          return;
        }

        const profile = {
          firstname: 'Test',
          lastname: '',
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
            payload: profile,
          })
          .then((result) => {
            expect(result.statusCode).toBe(400);
          });
      });
    });
  });

  // ============================================================================
  // GOAL TYPE TRANSITIONS
  // ============================================================================

  describe('Goal Type Transitions', () => {
    const goalTypes = ['fat_loss', 'muscle_gain', 'performance', 'maintenance'];

    it('PUT /api/v1/auth/profile - should transition from fat_loss to muscle_gain', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      // First create profile with fat_loss goal
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/auth/profile',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            firstname: 'Test',
            lastname: 'User',
            goalType: 'fat_loss',
          },
        });

      // Update to muscle_gain
      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PUT',
          url: '/api/v1/auth/profile',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            goalType: 'muscle_gain',
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const profile = JSON.parse(result.payload);
          expect(profile).toHaveProperty('goalType', 'muscle_gain');
        });
    });

    it('PUT /api/v1/auth/profile - should transition from muscle_gain to performance', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      // Update to performance
      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PUT',
          url: '/api/v1/auth/profile',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            goalType: 'performance',
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const profile = JSON.parse(result.payload);
          expect(profile).toHaveProperty('goalType', 'performance');
        });
    });

    it('PUT /api/v1/auth/profile - should transition from performance to maintenance', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PUT',
          url: '/api/v1/auth/profile',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            goalType: 'maintenance',
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const profile = JSON.parse(result.payload);
          expect(profile).toHaveProperty('goalType', 'maintenance');
        });
    });

    it('PUT /api/v1/auth/profile - should transition from maintenance back to fat_loss', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PUT',
          url: '/api/v1/auth/profile',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            goalType: 'fat_loss',
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const profile = JSON.parse(result.payload);
          expect(profile).toHaveProperty('goalType', 'fat_loss');
        });
    });

    goalTypes.forEach((goalType) => {
      it(`PUT /api/v1/auth/profile - should accept goal type: ${goalType}`, async () => {
        if (!testJWT) {
          console.warn('⏭️  Skipping test - no test JWT available');
          return;
        }

        return app
          .getHttpAdapter()
          .getInstance()
          .inject({
            method: 'PUT',
            url: '/api/v1/auth/profile',
            headers: {
              Authorization: `Bearer ${testJWT}`,
              'Content-Type': 'application/json',
            },
            payload: {
              goalType: goalType,
            },
          })
          .then((result) => {
            expect(result.statusCode).toBe(200);
            const profile = JSON.parse(result.payload);
            expect(profile).toHaveProperty('goalType', goalType);
          });
      });
    });

    it('PUT /api/v1/auth/profile - should reject invalid goal type', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PUT',
          url: '/api/v1/auth/profile',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            goalType: 'weight_gain', // Invalid - not in enum
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
        });
    });
  });

  // ============================================================================
  // UNIT SYSTEM CONVERSIONS
  // ============================================================================

  describe('Unit System Conversions', () => {
    it('PUT /api/v1/auth/profile - should switch from metric to imperial', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      // First create/update profile with metric
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PUT',
          url: '/api/v1/auth/profile',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            unitSystem: 'metric',
            heightCm: 180,
            weightKg: 80.0,
          },
        });

      // Switch to imperial
      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PUT',
          url: '/api/v1/auth/profile',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            unitSystem: 'imperial',
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const profile = JSON.parse(result.payload);
          expect(profile).toHaveProperty('unitSystem', 'imperial');
          // Note: Actual conversion would happen in the frontend
          // Backend stores everything in metric (cm/kg)
          expect(profile).toHaveProperty('heightCm', 180);
          expect(profile).toHaveProperty('weightKg', '80');
        });
    });

    it('PUT /api/v1/auth/profile - should switch from imperial to metric', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PUT',
          url: '/api/v1/auth/profile',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            unitSystem: 'metric',
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const profile = JSON.parse(result.payload);
          expect(profile).toHaveProperty('unitSystem', 'metric');
        });
    });

    it('PUT /api/v1/auth/profile - should update height and weight while using imperial system', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      // Update with imperial system and new measurements
      // Frontend would convert: 6 feet = 183cm, 200lbs = 90.7kg
      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PUT',
          url: '/api/v1/auth/profile',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            unitSystem: 'imperial',
            heightCm: 183, // ~6 feet
            weightKg: 90.7, // ~200 lbs
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const profile = JSON.parse(result.payload);
          expect(profile).toHaveProperty('unitSystem', 'imperial');
          expect(profile).toHaveProperty('heightCm', 183);
          expect(profile).toHaveProperty('weightKg', '90.7');
        });
    });

    it('PUT /api/v1/auth/profile - should reject invalid unit system', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PUT',
          url: '/api/v1/auth/profile',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            unitSystem: 'standard', // Invalid - not in enum
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(400);
        });
    });

    it('PUT /api/v1/auth/profile - should maintain measurements when switching unit systems', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      // Set metric values
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PUT',
          url: '/api/v1/auth/profile',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            unitSystem: 'metric',
            heightCm: 175,
            weightKg: 70.5,
          },
        });

      // Switch to imperial (measurements should be preserved in cm/kg)
      const imperialResult = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PUT',
          url: '/api/v1/auth/profile',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            unitSystem: 'imperial',
          },
        });

      expect(imperialResult.statusCode).toBe(200);
      const imperialProfile = JSON.parse(imperialResult.payload);
      expect(imperialProfile).toHaveProperty('unitSystem', 'imperial');
      expect(imperialProfile).toHaveProperty('heightCm', 175);
      expect(imperialProfile).toHaveProperty('weightKg', '70.5');

      // Switch back to metric (measurements should still be the same)
      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PUT',
          url: '/api/v1/auth/profile',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            unitSystem: 'metric',
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const metricProfile = JSON.parse(result.payload);
          expect(metricProfile).toHaveProperty('unitSystem', 'metric');
          expect(metricProfile).toHaveProperty('heightCm', 175);
          expect(metricProfile).toHaveProperty('weightKg', '70.5');
        });
    });
  });

  // ============================================================================
  // PROFILE UPDATES
  // ============================================================================

  describe('Profile Updates', () => {
    it('PUT /api/v1/auth/profile - should update single field', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PUT',
          url: '/api/v1/auth/profile',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            weightKg: 72.5,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const profile = JSON.parse(result.payload);
          expect(profile).toHaveProperty('weightKg', '72.5');
          // Other fields should remain unchanged
          expect(profile).toHaveProperty('firstname');
          expect(profile).toHaveProperty('lastname');
        });
    });

    it('PUT /api/v1/auth/profile - should update multiple fields at once', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PUT',
          url: '/api/v1/auth/profile',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            heightCm: 178,
            weightKg: 75.0,
            experienceLevel: 'advanced',
            goalType: 'muscle_gain',
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const profile = JSON.parse(result.payload);
          expect(profile).toHaveProperty('heightCm', 178);
          expect(profile).toHaveProperty('weightKg', '75');
          expect(profile).toHaveProperty('experienceLevel', 'advanced');
          expect(profile).toHaveProperty('goalType', 'muscle_gain');
        });
    });

    it('PUT /api/v1/auth/profile - should update health notes', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const healthNotes = 'Updated: Previous knee injury, cleared for full activity';

      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PUT',
          url: '/api/v1/auth/profile',
          headers: {
            Authorization: `Bearer ${testJWT}`,
            'Content-Type': 'application/json',
          },
          payload: {
            healthNotes: healthNotes,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(200);
          const profile = JSON.parse(result.payload);
          expect(profile).toHaveProperty('healthNotes', healthNotes);
        });
    });

    it('PUT /api/v1/auth/profile - should update experience level progression', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      // Simulate progression: beginner -> novice -> intermediate -> advanced -> elite
      const progressionLevels = ['novice', 'intermediate', 'advanced', 'elite'];

      for (const level of progressionLevels) {
        const result = await app
          .getHttpAdapter()
          .getInstance()
          .inject({
            method: 'PUT',
            url: '/api/v1/auth/profile',
            headers: {
              Authorization: `Bearer ${testJWT}`,
              'Content-Type': 'application/json',
            },
            payload: {
              experienceLevel: level,
            },
          });

        expect(result.statusCode).toBe(200);
        const profile = JSON.parse(result.payload);
        expect(profile).toHaveProperty('experienceLevel', level);
      }
    });

    it('PUT /api/v1/auth/profile - should track weight changes over time', async () => {
      if (!testJWT) {
        console.warn('⏭️  Skipping test - no test JWT available');
        return;
      }

      const weightChanges = [80.0, 78.5, 77.0, 75.5, 74.0];

      for (const weight of weightChanges) {
        const result = await app
          .getHttpAdapter()
          .getInstance()
          .inject({
            method: 'PUT',
            url: '/api/v1/auth/profile',
            headers: {
              Authorization: `Bearer ${testJWT}`,
              'Content-Type': 'application/json',
            },
            payload: {
              weightKg: weight,
            },
          });

        expect(result.statusCode).toBe(200);
        const profile = JSON.parse(result.payload);
        expect(profile).toHaveProperty('weightKg', weight.toString());
      }
    });

    it('PUT /api/v1/auth/profile - should return 401 without auth', () => {
      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PUT',
          url: '/api/v1/auth/profile',
          headers: {
            'Content-Type': 'application/json',
          },
          payload: {
            weightKg: 75.0,
          },
        })
        .then((result) => {
          expect(result.statusCode).toBe(401);
        });
    });
  });
});
