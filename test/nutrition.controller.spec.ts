// nutrition.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { NutritionController } from '../src/modules/nutrition/nutrition.controller';
import { NutritionService } from '../src/modules/nutrition/nutrition.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { CreateFoodItemDto } from '../src/modules/nutrition/dtos/create-food-item.dto';
import { UpdateFoodItemDto } from '../src/modules/nutrition/dtos/update-food-item.dto';
import { CreateMacroTargetDto } from '../src/modules/nutrition/dtos/create-macro-target.dto';
import { CreateGroceryListDto } from '../src/modules/nutrition/dtos/create-grocery-list.dto';
import { FoodItemNotFoundException } from '../src/common/exceptions/nutrition.exceptions';

describe('NutritionController', () => {
    let controller: NutritionController;
    let service: NutritionService;

    const mockPrismaService = {
        foodItem: {
            create: jest.fn(),
            findMany: jest.fn(),
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        macroTarget: {
            create: jest.fn(),
            findFirst: jest.fn(),
            findMany: jest.fn(),
            update: jest.fn(),
        },
        groceryList: {
            create: jest.fn(),
            findMany: jest.fn(),
            findFirst: jest.fn(),
            update: jest.fn(),
        },
        groceryItem: {
            deleteMany: jest.fn(),
        },
        $transaction: jest.fn((callback) => callback(mockPrismaService)),
    };

    const mockCacheManager = {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        reset: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [NutritionController],
            providers: [
                NutritionService,
                {
                    provide: PrismaService,
                    useValue: mockPrismaService,
                },
                {
                    provide: CACHE_MANAGER,
                    useValue: mockCacheManager,
                },
            ],
        }).compile();

        controller = module.get<NutritionController>(NutritionController);
        service = module.get<NutritionService>(NutritionService);

        // Clear mocks before each test
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
        expect(service).toBeDefined();
    });

    describe('Food Items', () => {
        describe('createFoodItem', () => {
            it('should create a food item successfully', async () => {
                const userId = 'user-123';
                const dto: CreateFoodItemDto = {
                    name: 'Chicken Breast',
                    servingG: 100,
                    calories: 165,
                    proteinG: 31,
                    carbsG: 0,
                    fatsG: 3.6,
                    tags: ['protein', 'meat'],
                };

                const expectedResult = {
                    id: 'food-123',
                    ...dto,
                    brand: null,
                    source: 'user',
                    deletedAt: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };

                mockPrismaService.foodItem.create.mockResolvedValue(expectedResult);

                const result = await controller.createFoodItem(userId, dto);

                expect(result).toEqual(expectedResult);
                expect(mockPrismaService.foodItem.create).toHaveBeenCalledWith({
                    data: expect.objectContaining({
                        name: dto.name,
                        calories: dto.calories,
                        source: 'user',
                    }),
                });
            });

            it('should validate nutrition data consistency', async () => {
                const userId = 'user-123';
                const dto: CreateFoodItemDto = {
                    name: 'Invalid Food',
                    servingG: 100,
                    calories: 1000, // Way off from calculated
                    proteinG: 10,
                    carbsG: 10,
                    fatsG: 10,
                };

                await expect(controller.createFoodItem(userId, dto)).rejects.toThrow();
            });
        });

        describe('getFoodItems', () => {
            it('should return all food items', async () => {
                const expectedResult = [
                    {
                        id: 'food-1',
                        name: 'Chicken Breast',
                        calories: 165,
                        proteinG: 31,
                        carbsG: 0,
                        fatsG: 3.6,
                        deletedAt: null,
                    },
                    {
                        id: 'food-2',
                        name: 'Brown Rice',
                        calories: 110,
                        proteinG: 2.6,
                        carbsG: 23,
                        fatsG: 0.9,
                        deletedAt: null,
                    },
                ];

                mockPrismaService.foodItem.findMany.mockResolvedValue(expectedResult);

                const result = await controller.getFoodItems();

                expect(result).toEqual(expectedResult);
                expect(mockPrismaService.foodItem.findMany).toHaveBeenCalledWith({
                    where: { deletedAt: null },
                    orderBy: { name: 'asc' },
                });
            });

            it('should filter by search term', async () => {
                const searchTerm = 'chicken';
                mockPrismaService.foodItem.findMany.mockResolvedValue([]);

                await controller.getFoodItems(searchTerm);

                expect(mockPrismaService.foodItem.findMany).toHaveBeenCalledWith({
                    where: {
                        deletedAt: null,
                        name: {
                            contains: searchTerm,
                            mode: 'insensitive',
                        },
                    },
                    orderBy: { name: 'asc' },
                });
            });

            it('should filter by tags', async () => {
                const tags = 'protein,lean';
                mockPrismaService.foodItem.findMany.mockResolvedValue([]);

                await controller.getFoodItems(undefined, tags);

                expect(mockPrismaService.foodItem.findMany).toHaveBeenCalledWith({
                    where: {
                        deletedAt: null,
                        tags: {
                            hasSome: ['protein', 'lean'],
                        },
                    },
                    orderBy: { name: 'asc' },
                });
            });
        });

        describe('getFoodItem', () => {
            it('should return a single food item', async () => {
                const foodId = 'food-123';
                const expectedResult = {
                    id: foodId,
                    name: 'Chicken Breast',
                    calories: 165,
                    deletedAt: null,
                };

                mockPrismaService.foodItem.findFirst.mockResolvedValue(expectedResult);

                const result = await controller.getFoodItem(foodId);

                expect(result).toEqual(expectedResult);
            });

            it('should throw NotFoundException if food item not found', async () => {
                const foodId = 'non-existent';
                mockPrismaService.foodItem.findFirst.mockResolvedValue(null);

                await expect(controller.getFoodItem(foodId)).rejects.toThrow(
                    FoodItemNotFoundException
                );
            });
        });

        describe('updateFoodItem', () => {
            it('should update a food item successfully', async () => {
                const foodId = 'food-123';
                const dto: UpdateFoodItemDto = {
                    name: 'Updated Chicken Breast',
                    calories: 170,
                };

                const existing = {
                    id: foodId,
                    name: 'Chicken Breast',
                    calories: 165,
                    proteinG: 31,
                    carbsG: 0,
                    fatsG: 3.6,
                    deletedAt: null,
                };

                const updated = { ...existing, ...dto };

                mockPrismaService.foodItem.findFirst.mockResolvedValue(existing);
                mockPrismaService.foodItem.findUnique.mockResolvedValue(existing);
                mockPrismaService.foodItem.update.mockResolvedValue(updated);

                const result = await controller.updateFoodItem(foodId, dto);

                expect(result).toEqual(updated);
            });
        });

        describe('deleteFoodItem', () => {
            it('should soft delete a food item', async () => {
                const foodId = 'food-123';
                const existing = {
                    id: foodId,
                    name: 'Chicken Breast',
                    deletedAt: null,
                };

                mockPrismaService.foodItem.findFirst.mockResolvedValue(existing);
                mockPrismaService.foodItem.update.mockResolvedValue({
                    ...existing,
                    deletedAt: new Date(),
                });

                await controller.deleteFoodItem(foodId);

                expect(mockPrismaService.foodItem.update).toHaveBeenCalledWith({
                    where: { id: foodId },
                    data: { deletedAt: expect.any(Date) },
                });
            });
        });
    });

    describe('Macro Targets', () => {
        describe('createMacroTarget', () => {
            it('should create a macro target successfully', async () => {
                const userId = 'user-123';
                const dto: CreateMacroTargetDto = {
                    calories: 2200,
                    proteinG: 180,
                    carbsG: 220,
                    fatsG: 60,
                };

                const expectedResult = {
                    id: 'target-123',
                    userId,
                    ...dto,
                    startsOn: new Date(),
                    endsOn: null,
                    deletedAt: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };

                mockPrismaService.macroTarget.create.mockResolvedValue(expectedResult);

                const result = await controller.createMacroTarget(userId, dto);

                expect(result).toEqual(expectedResult);
            });
        });

        describe('getCurrentMacroTarget', () => {
            it('should return current active macro target', async () => {
                const userId = 'user-123';
                const expectedResult = {
                    id: 'target-123',
                    userId,
                    calories: 2200,
                    startsOn: new Date('2025-01-01'),
                    endsOn: null,
                    deletedAt: null,
                };

                mockPrismaService.macroTarget.findFirst.mockResolvedValue(expectedResult);

                const result = await controller.getCurrentMacroTarget(userId);

                expect(result).toEqual(expectedResult);
            });
        });
    });

    describe('Grocery Lists', () => {
        describe('createGroceryList', () => {
            it('should create a grocery list with items', async () => {
                const userId = 'user-123';
                const dto: CreateGroceryListDto = {
                    title: 'Weekly Shopping',
                    weekOf: '2025-01-20',
                    items: [
                        {
                            name: 'Chicken Breast',
                            quantity: '2 lbs',
                        },
                    ],
                };

                const expectedResult = {
                    id: 'list-123',
                    userId,
                    title: dto.title,
                    weekOf: new Date(dto.weekOf),
                    items: [
                        {
                            id: 'item-123',
                            listId: 'list-123',
                            name: 'Chicken Breast',
                            quantity: '2 lbs',
                            isChecked: false,
                        },
                    ],
                    deletedAt: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };

                mockPrismaService.groceryList.create.mockResolvedValue(expectedResult);

                const result = await controller.createGroceryList(userId, dto);

                expect(result).toEqual(expectedResult);
            });
        });
    });
});
