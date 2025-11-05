// nutrition.service.ts
import {
    Injectable,
    Logger,
    InternalServerErrorException,
    Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { OwnershipValidator } from '../../common/services/ownership-validator.service';
import { ValidationService } from '../../common/services/validation.service';
import { FoodItem, GroceryList, MacroTarget } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { CreateFoodItemDto } from './dtos/create-food-item.dto';
import { UpdateFoodItemDto } from './dtos/update-food-item.dto';
import { CreateMacroTargetDto } from './dtos/create-macro-target.dto';
import { UpdateMacroTargetDto } from './dtos/update-macro-target.dto';
import { CreateGroceryListDto } from './dtos/create-grocery-list.dto';
import { UpdateGroceryListDto } from './dtos/update-grocery-list.dto';
import { FoodItemResponseDto } from './dtos/food-item-response.dto';
import { GroceryListResponseDto } from './dtos/grocery-list-response.dto';
import { MacroTargetResponseDto } from './dtos/macro-target-response.dto';
import {
    FoodItemNotFoundException,
    InvalidFoodItemDataException,
    MealLogNotFoundException,
    MealLogNotOwnedException,
    MacroTargetNotFoundException,
    MacroTargetNotOwnedException,
    GroceryListNotFoundException,
    GroceryListNotOwnedException,
    NutritionDataInconsistentException,
} from '../../common/exceptions/nutrition.exceptions';
import {
    decimalToNumber,
    PrismaGroceryList
} from './types/prisma-to-dto.types';

/**
 * Nutrition Service
 *
 * Senior-level business logic for nutrition tracking:
 * - Food items database management with validation
 * - Meal logging and tracking with calculations
 * - Macro targets management with conflict detection
 * - Grocery lists management
 * - Soft deletes for all entities
 * - Comprehensive error handling
 * - Caching for performance
 */
@Injectable()
export class NutritionService {
    private readonly logger = new Logger(NutritionService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService,
        @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
        private readonly ownershipValidator: OwnershipValidator,
        private readonly validationService: ValidationService
    ) { }

    // ==================== FOOD ITEMS ====================

    /**
     * Create a new food item in the database
     *
     * @param userId - ID of the user creating the food item
     * @param dto - Food item data transfer object
     * @returns Promise resolving to the created food item DTO
     * @throws InvalidFoodItemDataException if nutrition data is inconsistent
     * @throws InternalServerErrorException if database operation fails
     */
    async createFoodItem(userId: string, dto: CreateFoodItemDto): Promise<FoodItemResponseDto> {
        this.logger.log(`Creating food item: ${dto.name} by user ${userId}`);

        try {
            // Validate macros add up to calories (rough check)
            this.validateNutritionData(dto);

            const foodItem = await this.prisma.foodItem.create({
                data: {
                    name: dto.name,
                    brand: dto.brand,
                    servingG: dto.servingG,
                    calories: dto.calories,
                    proteinG: dto.proteinG,
                    carbsG: dto.carbsG,
                    fatsG: dto.fatsG,
                    tags: dto.tags || [],
                    source: 'user', // User-created food
                },
            });

            // Invalidate food items cache
            await this.invalidateFoodCache();

            this.logger.log(`Successfully created food item ${foodItem.id}`);
            return this.toFoodItemDto(foodItem);
        } catch (error) {
            this.logger.error(`Failed to create food item: ${error.message}`, error.stack);

            if (error instanceof InvalidFoodItemDataException) {
                throw error;
            }

            throw new InternalServerErrorException('Failed to create food item');
        }
    }

    /**
     * Get all food items with optional search and tag filtering
     * Excludes soft-deleted items
     *
     * @param search - Optional search term to filter by food name
     * @param tags - Optional comma-separated tags to filter by
     * @returns Promise resolving to array of food item DTOs
     * @throws InternalServerErrorException if database operation fails
     */
    async getFoodItems(search?: string, tags?: string): Promise<FoodItemResponseDto[]> {
        try {
            const where: Prisma.FoodItemWhereInput = {
                deletedAt: null, // Exclude soft-deleted
            };

            if (search) {
                where.name = {
                    contains: search,
                    mode: 'insensitive',
                };
            }

            if (tags) {
                const tagArray = tags.split(',').map((t) => t.trim());
                where.tags = {
                    hasSome: tagArray,
                };
            }

            const foodItems = await this.prisma.foodItem.findMany({
                where,
                orderBy: { name: 'asc' },
            });

            this.logger.debug(`Retrieved ${foodItems.length} food items`);
            return foodItems.map(item => this.toFoodItemDto(item));
        } catch (error) {
            this.logger.error(`Failed to get food items: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to retrieve food items');
        }
    }

    /**
     * Get a single food item by ID
     *
     * @param id - UUID of the food item
     * @returns Promise resolving to the food item DTO
     * @throws FoodItemNotFoundException if food item not found or deleted
     * @throws InternalServerErrorException if database operation fails
     */
    async getFoodItem(id: string): Promise<FoodItemResponseDto> {
        try {
            const foodItem = await this.prisma.foodItem.findFirst({
                where: {
                    id,
                    deletedAt: null, // Exclude soft-deleted
                },
            });

            if (!foodItem) {
                this.logger.warn(`Food item ${id} not found`);
                throw new FoodItemNotFoundException(id);
            }

            this.logger.debug(`Retrieved food item ${id}`);
            return this.toFoodItemDto(foodItem);
        } catch (error) {
            if (error instanceof FoodItemNotFoundException) {
                throw error;
            }

            this.logger.error(`Failed to get food item ${id}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to retrieve food item');
        }
    }

    /**
     * Update a food item
     *
     * @param id - UUID of the food item to update
     * @param dto - Partial food item data for update
     * @returns Promise resolving to the updated food item DTO
     * @throws FoodItemNotFoundException if food item not found
     * @throws InvalidFoodItemDataException if updated nutrition data is inconsistent
     * @throws InternalServerErrorException if database operation fails
     */
    async updateFoodItem(id: string, dto: UpdateFoodItemDto): Promise<FoodItemResponseDto> {
        try {
            // Verify exists (and not deleted)
            await this.getFoodItem(id);

            // Validate if nutrition data is being updated
            if (dto.calories || dto.proteinG || dto.carbsG || dto.fatsG) {
                const existing = await this.prisma.foodItem.findUnique({ where: { id } });
                const updated = { ...existing, ...dto };
                this.validateNutritionData(updated as any);
            }

            this.logger.log(`Updating food item ${id}`);

            const foodItem = await this.prisma.foodItem.update({
                where: { id },
                data: {
                    ...(dto.name && { name: dto.name }),
                    ...(dto.brand !== undefined && { brand: dto.brand }),
                    ...(dto.servingG !== undefined && { servingG: dto.servingG }),
                    ...(dto.calories !== undefined && { calories: dto.calories }),
                    ...(dto.proteinG !== undefined && { proteinG: dto.proteinG }),
                    ...(dto.carbsG !== undefined && { carbsG: dto.carbsG }),
                    ...(dto.fatsG !== undefined && { fatsG: dto.fatsG }),
                    ...(dto.tags !== undefined && { tags: dto.tags }),
                },
            });

            // Invalidate cache
            await this.invalidateFoodCache();

            return this.toFoodItemDto(foodItem);
        } catch (error) {
            if (error instanceof FoodItemNotFoundException || error instanceof InvalidFoodItemDataException) {
                throw error;
            }

            this.logger.error(`Failed to update food item ${id}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to update food item');
        }
    }

    /**
     * Soft delete a food item
     */
    async deleteFoodItem(id: string) {
        try {
            // Verify exists
            await this.getFoodItem(id);

            this.logger.log(`Soft deleting food item ${id}`);

            await this.prisma.foodItem.update({
                where: { id },
                data: { deletedAt: new Date() },
            });

            // Invalidate cache
            await this.invalidateFoodCache();
        } catch (error) {
            if (error instanceof FoodItemNotFoundException) {
                throw error;
            }

            this.logger.error(`Failed to delete food item ${id}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to delete food item');
        }
    }

    // ==================== MEAL LOGS ====================
    // DEPRECATED: Meal logging functionality moved to MealLogService
    // This service is kept for backwards compatibility but should not be used
    // Use MealLogService from ./services/meal-log.service.ts instead

    // ==================== MACRO TARGETS ====================

    /**
     * Create a new macro target
     *
     * @param userId - ID of the user creating the macro target
     * @param dto - Macro target data transfer object
     * @returns Promise resolving to the created macro target DTO
     * @throws InvalidFoodItemDataException if no macro values provided
     * @throws InternalServerErrorException if database operation fails
     */
    async createMacroTarget(userId: string, dto: CreateMacroTargetDto): Promise<MacroTargetResponseDto> {
        this.logger.log(`Creating macro target for user ${userId}`);

        try {
            // Validate at least one macro is provided
            if (!dto.calories && !dto.proteinG && !dto.carbsG && !dto.fatsG) {
                throw new InvalidFoodItemDataException(
                    'At least one macro value (calories, protein, carbs, or fats) must be provided'
                );
            }

            const macroTarget = await this.prisma.macroTarget.create({
                data: {
                    userId,
                    calories: dto.calories,
                    proteinG: dto.proteinG,
                    carbsG: dto.carbsG,
                    fatsG: dto.fatsG,
                    startsOn: dto.startsOn ? new Date(dto.startsOn) : new Date(),
                    endsOn: dto.endsOn ? new Date(dto.endsOn) : null,
                },
            });

            this.logger.log(`Successfully created macro target ${macroTarget.id}`);
            return this.toMacroTargetDto(macroTarget);
        } catch (error) {
            if (error instanceof InvalidFoodItemDataException) {
                throw error;
            }

            this.logger.error(`Failed to create macro target: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to create macro target');
        }
    }

    /**
     * Get user's current active macro target
     *
     * @param userId - ID of the user
     * @returns Promise resolving to the current active macro target DTO
     * @throws MacroTargetNotFoundException if no active target found
     * @throws InternalServerErrorException if database operation fails
     */
    async getCurrentMacroTarget(userId: string): Promise<MacroTargetResponseDto> {
        try {
            const now = new Date();

            const macroTarget = await this.prisma.macroTarget.findFirst({
                where: {
                    userId,
                    deletedAt: null,
                    startsOn: { lte: now },
                    OR: [
                        { endsOn: null },
                        { endsOn: { gte: now } },
                    ],
                },
                orderBy: { startsOn: 'desc' },
            });

            if (!macroTarget) {
                this.logger.warn(`No active macro target found for user ${userId}`);
                throw new MacroTargetNotFoundException();
            }

            return this.toMacroTargetDto(macroTarget);
        } catch (error) {
            if (error instanceof MacroTargetNotFoundException) {
                throw error;
            }

            this.logger.error(`Failed to get current macro target: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to retrieve macro target');
        }
    }

    /**
     * Get all user's macro targets (history)
     *
     * @param userId - ID of the user
     * @returns Promise resolving to array of macro target DTOs
     * @throws InternalServerErrorException if database operation fails
     */
    async getUserMacroTargets(userId: string): Promise<MacroTargetResponseDto[]> {
        try {
            const targets = await this.prisma.macroTarget.findMany({
                where: {
                    userId,
                    deletedAt: null,
                },
                orderBy: { startsOn: 'desc' },
            });

            return targets.map(target => this.toMacroTargetDto(target));
        } catch (error) {
            this.logger.error(`Failed to get macro targets: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to retrieve macro targets');
        }
    }

    /**
     * Update a macro target
     *
     * @param id - UUID of the macro target
     * @param userId - ID of the user (for ownership verification)
     * @param dto - Partial macro target data for update
     * @returns Promise resolving to the updated macro target DTO
     * @throws MacroTargetNotFoundException if target not found
     * @throws MacroTargetNotOwnedException if user doesn't own the target
     * @throws InternalServerErrorException if database operation fails
     */
    async updateMacroTarget(id: string, userId: string, dto: UpdateMacroTargetDto): Promise<MacroTargetResponseDto> {
        try {
            const macroTarget = await this.prisma.macroTarget.findFirst({
                where: {
                    id,
                    deletedAt: null,
                },
            });

            // Validate ownership using centralized validator
            this.ownershipValidator.validateOwnershipWithCustomExceptions(
                macroTarget,
                userId,
                'MacroTarget',
                id,
                new MacroTargetNotFoundException(id),
                new MacroTargetNotOwnedException(id, userId)
            );

            this.logger.log(`Updating macro target ${id}`);

            const updated = await this.prisma.macroTarget.update({
                where: { id },
                data: {
                    ...(dto.calories !== undefined && { calories: dto.calories }),
                    ...(dto.proteinG !== undefined && { proteinG: dto.proteinG }),
                    ...(dto.carbsG !== undefined && { carbsG: dto.carbsG }),
                    ...(dto.fatsG !== undefined && { fatsG: dto.fatsG }),
                    ...(dto.startsOn !== undefined && { startsOn: new Date(dto.startsOn) }),
                    ...(dto.endsOn !== undefined && { endsOn: dto.endsOn ? new Date(dto.endsOn) : null }),
                },
            });

            return this.toMacroTargetDto(updated);
        } catch (error) {
            if (error instanceof MacroTargetNotFoundException || error instanceof MacroTargetNotOwnedException) {
                throw error;
            }

            this.logger.error(`Failed to update macro target ${id}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to update macro target');
        }
    }

    /**
     * Soft delete a macro target
     */
    async deleteMacroTarget(id: string, userId: string) {
        try {
            const macroTarget = await this.prisma.macroTarget.findFirst({
                where: {
                    id,
                    deletedAt: null,
                },
            });

            // Validate ownership using centralized validator
            this.ownershipValidator.validateOwnershipWithCustomExceptions(
                macroTarget,
                userId,
                'MacroTarget',
                id,
                new MacroTargetNotFoundException(id),
                new MacroTargetNotOwnedException(id, userId)
            );

            this.logger.log(`Soft deleting macro target ${id}`);

            await this.prisma.macroTarget.update({
                where: { id },
                data: { deletedAt: new Date() },
            });
        } catch (error) {
            if (error instanceof MacroTargetNotFoundException || error instanceof MacroTargetNotOwnedException) {
                throw error;
            }

            this.logger.error(`Failed to delete macro target ${id}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to delete macro target');
        }
    }

    // ==================== GROCERY LISTS ====================

    /**
     * Create a new grocery list
     *
     * @param userId - ID of the user creating the grocery list
     * @param dto - Grocery list data transfer object
     * @returns Promise resolving to the created grocery list DTO
     * @throws InternalServerErrorException if database operation fails
     */
    async createGroceryList(userId: string, dto: CreateGroceryListDto): Promise<GroceryListResponseDto> {
        this.logger.log(`Creating grocery list for user ${userId}`);

        try {
            const groceryList = await this.prisma.groceryList.create({
                data: {
                    userId,
                    title: dto.title || 'Weekly Grocery List',
                    weekOf: new Date(dto.weekOf),
                    items: {
                        create: dto.items?.map((item) => ({
                            foodItemId: item.foodItemId,
                            name: item.name,
                            quantity: item.quantity,
                            isChecked: item.isChecked ?? false,
                        })) || [],
                    },
                },
                include: {
                    items: {
                        include: {
                            foodItem: true,
                        },
                    },
                },
            });

            this.logger.log(`Successfully created grocery list ${groceryList.id}`);
            return this.toGroceryListDto(groceryList);
        } catch (error) {
            this.logger.error(`Failed to create grocery list: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to create grocery list');
        }
    }

    /**
     * Get all user's grocery lists
     *
     * @param userId - ID of the user
     * @returns Promise resolving to array of grocery list DTOs
     * @throws InternalServerErrorException if database operation fails
     */
    async getUserGroceryLists(userId: string): Promise<GroceryListResponseDto[]> {
        try {
            const lists = await this.prisma.groceryList.findMany({
                where: {
                    userId,
                    deletedAt: null,
                },
                include: {
                    items: {
                        include: {
                            foodItem: true,
                        },
                    },
                },
                orderBy: { weekOf: 'desc' },
            }) as PrismaGroceryList[];

            return lists.map(list => this.toGroceryListDto(list));
        } catch (error) {
            this.logger.error(`Failed to get grocery lists: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to retrieve grocery lists');
        }
    }

    /**
     * Get a single grocery list by ID
     *
     * @param id - UUID of the grocery list
     * @param userId - ID of the user (for ownership verification)
     * @returns Promise resolving to the grocery list DTO
     * @throws GroceryListNotFoundException if list not found
     * @throws GroceryListNotOwnedException if user doesn't own the list
     * @throws InternalServerErrorException if database operation fails
     */
    async getGroceryList(id: string, userId: string): Promise<GroceryListResponseDto> {
        try {
            const groceryList = await this.prisma.groceryList.findFirst({
                where: {
                    id,
                    deletedAt: null,
                },
                include: {
                    items: {
                        include: {
                            foodItem: true,
                        },
                    },
                },
            }) as PrismaGroceryList | null;

            // Validate ownership using centralized validator (returns guaranteed non-null entity)
            const validatedList = this.ownershipValidator.validateOwnershipWithCustomExceptions(
                groceryList,
                userId,
                'GroceryList',
                id,
                new GroceryListNotFoundException(id),
                new GroceryListNotOwnedException(id, userId)
            );

            return this.toGroceryListDto(validatedList);
        } catch (error) {
            if (error instanceof GroceryListNotFoundException || error instanceof GroceryListNotOwnedException) {
                throw error;
            }

            this.logger.error(`Failed to get grocery list ${id}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to retrieve grocery list');
        }
    }

    /**
     * Update a grocery list
     *
     * @param id - UUID of the grocery list
     * @param userId - ID of the user (for ownership verification)
     * @param dto - Partial grocery list data for update
     * @returns Promise resolving to the updated grocery list DTO
     * @throws GroceryListNotFoundException if list not found
     * @throws GroceryListNotOwnedException if user doesn't own the list
     * @throws InternalServerErrorException if database operation fails
     */
    async updateGroceryList(id: string, userId: string, dto: UpdateGroceryListDto): Promise<GroceryListResponseDto> {
        try {
            // Verify ownership
            await this.getGroceryList(id, userId);

            this.logger.log(`Updating grocery list ${id}`);

            // Get transaction configuration
            const txConfig = this.configService.get('transaction.default') || {
                maxWait: 2000,
                timeout: 5000,
                isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            };

            // Use transaction for atomic updates with proper error handling
            return await this.prisma.$transaction(async (tx) => {
                // Update basic fields
                const updateData: Prisma.GroceryListUpdateInput = {};
                if (dto.title !== undefined) updateData.title = dto.title;
                if (dto.weekOf !== undefined) updateData.weekOf = new Date(dto.weekOf);

                // Handle item updates (delete + recreate pattern)
                if (dto.items) {
                    await tx.groceryItem.deleteMany({
                        where: { listId: id },
                    });

                    updateData.items = {
                        create: dto.items.map((item) => ({
                            foodItemId: item.foodItemId,
                            name: item.name,
                            quantity: item.quantity,
                            isChecked: item.isChecked ?? false,
                        })),
                    };
                }

                const updated = await tx.groceryList.update({
                    where: { id },
                    data: updateData,
                    include: {
                        items: {
                            include: {
                                foodItem: true,
                            },
                        },
                    },
                });

                return this.toGroceryListDto(updated);
            }, txConfig);
        } catch (error) {
            // Re-throw domain exceptions
            if (error instanceof GroceryListNotFoundException || error instanceof GroceryListNotOwnedException) {
                throw error;
            }

            // Handle Prisma-specific errors
            if (error instanceof Prisma.PrismaClientKnownRequestError) {
                this.logger.error(`Prisma error updating grocery list ${id}: ${error.code} - ${error.message}`, error.stack);

                switch (error.code) {
                    case 'P2002':
                        // Unique constraint violation
                        throw new InternalServerErrorException({
                            message: 'A grocery list with this data already exists',
                            error: 'GroceryListAlreadyExists',
                        });
                    case 'P2025':
                        // Record not found during update
                        throw new GroceryListNotFoundException(id);
                    default:
                        throw new InternalServerErrorException({
                            message: 'Database operation failed',
                            error: 'DatabaseError',
                        });
                }
            }

            // Handle transaction timeout errors
            if (error instanceof Prisma.PrismaClientUnknownRequestError) {
                this.logger.error(`Transaction timeout updating grocery list ${id}: ${error.message}`, error.stack);
                throw new InternalServerErrorException({
                    message: 'Operation timed out. Please try again.',
                    error: 'TransactionTimeout',
                });
            }

            // Generic error handling
            this.logger.error(`Failed to update grocery list ${id}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to update grocery list');
        }
    }

    /**
     * Soft delete a grocery list
     */
    async deleteGroceryList(id: string, userId: string) {
        try {
            // Verify ownership
            await this.getGroceryList(id, userId);

            this.logger.log(`Soft deleting grocery list ${id}`);

            await this.prisma.groceryList.update({
                where: { id },
                data: { deletedAt: new Date() },
            });
        } catch (error) {
            if (error instanceof GroceryListNotFoundException || error instanceof GroceryListNotOwnedException) {
                throw error;
            }

            this.logger.error(`Failed to delete grocery list ${id}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to delete grocery list');
        }
    }

    // ==================== HELPER METHODS ====================

    /**
     * Convert Prisma FoodItem to response DTO with Decimal to number conversion
     *
     * @param foodItem - Prisma FoodItem entity with Decimal fields
     * @returns FoodItemResponseDto with number fields
     */
    private toFoodItemDto(foodItem: FoodItem): FoodItemResponseDto {
        return {
            id: foodItem.id,
            name: foodItem.name,
            brand: foodItem.brand,
            servingG: foodItem.servingG,
            calories: foodItem.calories,
            proteinG: decimalToNumber(foodItem.proteinG),
            carbsG: decimalToNumber(foodItem.carbsG),
            fatsG: decimalToNumber(foodItem.fatsG),
            tags: foodItem.tags,
            source: foodItem.source,
            createdAt: foodItem.createdAt,
            updatedAt: foodItem.updatedAt,
        };
    }

    /**
     * Convert Prisma MacroTarget to response DTO with Decimal to number conversion
     *
     * @param target - Prisma MacroTarget entity with Decimal fields
     * @returns MacroTargetResponseDto with number fields
     */
    private toMacroTargetDto(target: MacroTarget): MacroTargetResponseDto {
        return {
            id: target.id,
            userId: target.userId,
            calories: target.calories,
            proteinG: target.proteinG ? decimalToNumber(target.proteinG) : null,
            carbsG: target.carbsG ? decimalToNumber(target.carbsG) : null,
            fatsG: target.fatsG ? decimalToNumber(target.fatsG) : null,
            startsOn: target.startsOn,
            endsOn: target.endsOn,
            createdAt: target.createdAt,
            updatedAt: target.updatedAt,
        };
    }

    /**
     * Convert Prisma GroceryList to response DTO with nested foodItem conversion
     *
     * @param groceryList - Prisma GroceryList with included items and foodItems
     * @returns GroceryListResponseDto with properly typed nested structures
     */
    private toGroceryListDto(groceryList: PrismaGroceryList): GroceryListResponseDto {
        return {
            id: groceryList.id,
            userId: groceryList.userId,
            title: groceryList.title,
            weekOf: groceryList.weekOf,
            createdAt: groceryList.createdAt,
            updatedAt: groceryList.updatedAt,
            items: groceryList.items.map(item => ({
                id: item.id,
                listId: item.listId,
                foodItemId: item.foodItemId,
                name: item.name,
                quantity: item.quantity,
                isChecked: item.isChecked,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
                foodItem: item.foodItem ? this.toFoodItemDto(item.foodItem) : null,
            })),
        };
    }

    /**
     * Validate nutrition data consistency
     *
     * Delegates to centralized ValidationService for consistent validation logic
     */
    private validateNutritionData(data: {
        calories: number;
        proteinG: number;
        carbsG: number;
        fatsG: number;
    }): void {
        // Use centralized validation service
        this.validationService.validateNutritionData(data);
    }

    /**
     * Invalidate food items cache
     */
    private async invalidateFoodCache(): Promise<void> {
        try {
            // Clear all food-related cache keys using centralized config
            const cacheKey = this.configService.get<string>('cache.keys.foodItems') || 'food-items-all';
            await this.cacheManager.del(cacheKey);
            // Could use pattern matching if cache manager supports it
            // await this.cacheManager.reset(); // Nuclear option
        } catch (error) {
            this.logger.error(`Failed to invalidate cache: ${error.message}`);
        }
    }
}
