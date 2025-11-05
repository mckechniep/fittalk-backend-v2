// test/nutrition.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Nutrition E2E Integration Tests
 *
 * Tests the complete nutrition API flow:
 * - Authentication
 * - Food items CRUD
 * - Macro targets CRUD
 * - Grocery lists CRUD
 * - Validation
 * - Error handling
 * - Response DTOs
 *
 * Run with: npm run test:e2e
 */
describe('Nutrition Module (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let authToken: string;
    let userId: string;
    let foodItemId: string;
    let macroTargetId: string;
    let groceryListId: string;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe());
        await app.init();

        prisma = app.get<PrismaService>(PrismaService);

        // Create test user and get auth token
        // Note: You'll need to implement your auth flow here
        // This is a placeholder
        authToken = 'test-jwt-token';
        userId = 'test-user-id';
    });

    afterAll(async () => {
        // Cleanup: Delete test data
        if (foodItemId) {
            await prisma.foodItem.deleteMany({ where: { id: foodItemId } });
        }
        if (macroTargetId) {
            await prisma.macroTarget.deleteMany({ where: { id: macroTargetId } });
        }
        if (groceryListId) {
            await prisma.groceryList.deleteMany({ where: { id: groceryListId } });
        }

        await app.close();
    });

    describe('/nutrition/foods (Food Items)', () => {
        describe('POST /nutrition/foods', () => {
            it('should create a new food item', () => {
                return request(app.getHttpServer())
                    .post('/nutrition/foods')
                    .set('Authorization', `Bearer ${authToken}`)
                    .send({
                        name: 'E2E Test Chicken Breast',
                        servingG: 100,
                        calories: 165,
                        proteinG: 31,
                        carbsG: 0,
                        fatsG: 3.6,
                        tags: ['protein', 'meat', 'e2e-test'],
                    })
                    .expect(201)
                    .then((response) => {
                        expect(response.body).toHaveProperty('id');
                        expect(response.body.name).toBe('E2E Test Chicken Breast');
                        expect(response.body.calories).toBe(165);
                        expect(response.body.source).toBe('user');
                        foodItemId = response.body.id;
                    });
            });

            it('should reject invalid nutrition data', () => {
                return request(app.getHttpServer())
                    .post('/nutrition/foods')
                    .set('Authorization', `Bearer ${authToken}`)
                    .send({
                        name: 'Invalid Food',
                        servingG: 100,
                        calories: 1000, // Way off from macros
                        proteinG: 10,
                        carbsG: 10,
                        fatsG: 10,
                    })
                    .expect(400);
            });

            it('should sanitize XSS in food name', () => {
                return request(app.getHttpServer())
                    .post('/nutrition/foods')
                    .set('Authorization', `Bearer ${authToken}`)
                    .send({
                        name: '<script>alert("xss")</script>Clean Chicken',
                        servingG: 100,
                        calories: 165,
                        proteinG: 31,
                        carbsG: 0,
                        fatsG: 3.6,
                    })
                    .expect(201)
                    .then((response) => {
                        expect(response.body.name).not.toContain('<script>');
                        expect(response.body.name).toContain('Clean Chicken');
                    });
            });

            it('should enforce rate limiting', async () => {
                const requests = Array(12)
                    .fill(null)
                    .map(() =>
                        request(app.getHttpServer())
                            .post('/nutrition/foods')
                            .set('Authorization', `Bearer ${authToken}`)
                            .send({
                                name: 'Rate Limit Test',
                                calories: 100,
                                proteinG: 10,
                                carbsG: 10,
                                fatsG: 5,
                            })
                    );

                const responses = await Promise.all(requests);
                const rateLimited = responses.some((r) => r.status === 429);
                expect(rateLimited).toBe(true);
            });
        });

        describe('GET /nutrition/foods', () => {
            it('should return all food items', () => {
                return request(app.getHttpServer())
                    .get('/nutrition/foods')
                    .set('Authorization', `Bearer ${authToken}`)
                    .expect(200)
                    .then((response) => {
                        expect(Array.isArray(response.body)).toBe(true);
                        expect(response.body.length).toBeGreaterThan(0);
                    });
            });

            it('should filter by search term', () => {
                return request(app.getHttpServer())
                    .get('/nutrition/foods?search=E2E Test Chicken')
                    .set('Authorization', `Bearer ${authToken}`)
                    .expect(200)
                    .then((response) => {
                        expect(Array.isArray(response.body)).toBe(true);
                        if (response.body.length > 0) {
                            expect(response.body[0].name).toContain('E2E Test Chicken');
                        }
                    });
            });

            it('should filter by tags', () => {
                return request(app.getHttpServer())
                    .get('/nutrition/foods?tags=e2e-test')
                    .set('Authorization', `Bearer ${authToken}`)
                    .expect(200)
                    .then((response) => {
                        expect(Array.isArray(response.body)).toBe(true);
                        if (response.body.length > 0) {
                            expect(response.body[0].tags).toContain('e2e-test');
                        }
                    });
            });

            it('should cache GET requests', async () => {
                // First request - should hit database
                const start1 = Date.now();
                await request(app.getHttpServer())
                    .get('/nutrition/foods')
                    .set('Authorization', `Bearer ${authToken}`)
                    .expect(200);
                const duration1 = Date.now() - start1;

                // Second request - should hit cache (faster)
                const start2 = Date.now();
                await request(app.getHttpServer())
                    .get('/nutrition/foods')
                    .set('Authorization', `Bearer ${authToken}`)
                    .expect(200);
                const duration2 = Date.now() - start2;

                // Cache should be faster (though this can be flaky)
                expect(duration2).toBeLessThanOrEqual(duration1);
            });
        });

        describe('GET /nutrition/foods/:id', () => {
            it('should return a single food item', () => {
                return request(app.getHttpServer())
                    .get(`/nutrition/foods/${foodItemId}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .expect(200)
                    .then((response) => {
                        expect(response.body.id).toBe(foodItemId);
                        expect(response.body.name).toBe('E2E Test Chicken Breast');
                    });
            });

            it('should return 404 for non-existent food item', () => {
                return request(app.getHttpServer())
                    .get('/nutrition/foods/00000000-0000-0000-0000-000000000000')
                    .set('Authorization', `Bearer ${authToken}`)
                    .expect(404);
            });
        });

        describe('PATCH /nutrition/foods/:id', () => {
            it('should update a food item', () => {
                return request(app.getHttpServer())
                    .patch(`/nutrition/foods/${foodItemId}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .send({
                        name: 'Updated E2E Test Chicken',
                        calories: 170,
                    })
                    .expect(200)
                    .then((response) => {
                        expect(response.body.name).toBe('Updated E2E Test Chicken');
                        expect(response.body.calories).toBe(170);
                    });
            });
        });

        describe('DELETE /nutrition/foods/:id', () => {
            it('should soft delete a food item', () => {
                return request(app.getHttpServer())
                    .delete(`/nutrition/foods/${foodItemId}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .expect(204);
            });

            it('should not return deleted items in GET', () => {
                return request(app.getHttpServer())
                    .get(`/nutrition/foods/${foodItemId}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .expect(404);
            });
        });
    });

    describe('/nutrition/targets (Macro Targets)', () => {
        describe('POST /nutrition/targets', () => {
            it('should create a macro target', () => {
                return request(app.getHttpServer())
                    .post('/nutrition/targets')
                    .set('Authorization', `Bearer ${authToken}`)
                    .send({
                        calories: 2200,
                        proteinG: 180,
                        carbsG: 220,
                        fatsG: 60,
                        startsOn: new Date().toISOString(),
                    })
                    .expect(201)
                    .then((response) => {
                        expect(response.body).toHaveProperty('id');
                        expect(response.body.calories).toBe(2200);
                        macroTargetId = response.body.id;
                    });
            });

            it('should require at least one macro value', () => {
                return request(app.getHttpServer())
                    .post('/nutrition/targets')
                    .set('Authorization', `Bearer ${authToken}`)
                    .send({})
                    .expect(400);
            });
        });

        describe('GET /nutrition/targets/current', () => {
            it('should return current active macro target', () => {
                return request(app.getHttpServer())
                    .get('/nutrition/targets/current')
                    .set('Authorization', `Bearer ${authToken}`)
                    .expect(200)
                    .then((response) => {
                        expect(response.body).toHaveProperty('id');
                        expect(response.body.calories).toBe(2200);
                    });
            });
        });
    });

    describe('/nutrition/grocery-lists (Grocery Lists)', () => {
        describe('POST /nutrition/grocery-lists', () => {
            it('should create a grocery list with items', () => {
                return request(app.getHttpServer())
                    .post('/nutrition/grocery-lists')
                    .set('Authorization', `Bearer ${authToken}`)
                    .send({
                        title: 'E2E Test Weekly Shopping',
                        weekOf: new Date().toISOString(),
                        items: [
                            {
                                name: 'Test Chicken',
                                quantity: '2 lbs',
                            },
                            {
                                name: 'Test Rice',
                                quantity: '1 bag',
                            },
                        ],
                    })
                    .expect(201)
                    .then((response) => {
                        expect(response.body).toHaveProperty('id');
                        expect(response.body.title).toBe('E2E Test Weekly Shopping');
                        expect(response.body.items).toHaveLength(2);
                        groceryListId = response.body.id;
                    });
            });
        });

        describe('GET /nutrition/grocery-lists', () => {
            it('should return all grocery lists', () => {
                return request(app.getHttpServer())
                    .get('/nutrition/grocery-lists')
                    .set('Authorization', `Bearer ${authToken}`)
                    .expect(200)
                    .then((response) => {
                        expect(Array.isArray(response.body)).toBe(true);
                        expect(response.body.length).toBeGreaterThan(0);
                    });
            });
        });

        describe('PATCH /nutrition/grocery-lists/:id', () => {
            it('should update a grocery list', () => {
                return request(app.getHttpServer())
                    .patch(`/nutrition/grocery-lists/${groceryListId}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .send({
                        title: 'Updated E2E Test List',
                        items: [
                            {
                                name: 'Updated Chicken',
                                quantity: '3 lbs',
                                isChecked: true,
                            },
                        ],
                    })
                    .expect(200)
                    .then((response) => {
                        expect(response.body.title).toBe('Updated E2E Test List');
                        expect(response.body.items[0].isChecked).toBe(true);
                    });
            });
        });
    });

    describe('Authentication & Authorization', () => {
        it('should reject requests without auth token', () => {
            return request(app.getHttpServer())
                .get('/nutrition/foods')
                .expect(401);
        });

        it('should reject requests with invalid token', () => {
            return request(app.getHttpServer())
                .get('/nutrition/foods')
                .set('Authorization', 'Bearer invalid-token')
                .expect(401);
        });
    });

    describe('Audit Logging', () => {
        it('should create audit log for CREATE operations', async () => {
            await request(app.getHttpServer())
                .post('/nutrition/foods')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Audit Test Food',
                    calories: 100,
                    proteinG: 10,
                    carbsG: 10,
                    fatsG: 5,
                })
                .expect(201);

            // Check audit log was created
            const auditLog = await prisma.auditLog.findFirst({
                where: {
                    userId,
                    action: 'CREATE',
                    entityType: 'FoodItem',
                },
                orderBy: { createdAt: 'desc' },
            });

            expect(auditLog).toBeTruthy();
            expect(auditLog?.action).toBe('CREATE');
        });
    });
});
