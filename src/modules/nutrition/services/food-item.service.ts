import { Injectable, Logger, InternalServerErrorException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { ValidationService } from '../../../common/services/validation.service';
import { Prisma, FoodItem } from '@prisma/client';
import { CreateFoodItemDto } from '../dtos/create-food-item.dto';
import { UpdateFoodItemDto } from '../dtos/update-food-item.dto';
import { FoodItemResponseDto } from '../dtos/food-item-response.dto';
import {
    FoodItemNotFoundException,
    InvalidFoodItemDataException,
} from '../../../common/exceptions/nutrition.exceptions';
import { decimalToNumber } from '../types/prisma-to-dto.types';

/**
 * Food Item Service
 *
 * Handles all business logic for food items (nutritional database).
 *
 * Responsibilities:
 * - CRUD operations for food items
 * - Nutrition data validation
 * - Cache management for food items
 * - Soft-delete support
 * - Search and filtering by tags
 *
 * Design principles:
 * - Single Responsibility: Only manages food items
 * - Cache invalidation on mutations
 * - Proper error handling and logging
 * - Nutrition data consistency validation
 */
@Injectable()
export class FoodItemService {
    private readonly logger = new Logger(FoodItemService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly validationService: ValidationService,
        private readonly configService: ConfigService,
        @Inject(CACHE_MANAGER) private cacheManager: Cache,
    ) {}

    /**
     * Create a new food item
     *
     * @param userId - User ID creating the food (for audit trail)
     * @param dto - Food item creation data
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
            await this.invalidateItemCache(foodItem.id);

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
                if (!existing) {
                    throw new FoodItemNotFoundException(id);
                }

                // Build validation object with proper types
                const validationData = {
                    calories: dto.calories ?? existing.calories,
                    proteinG: dto.proteinG ?? decimalToNumber(existing.proteinG),
                    carbsG: dto.carbsG ?? decimalToNumber(existing.carbsG),
                    fatsG: dto.fatsG ?? decimalToNumber(existing.fatsG),
                };
                this.validateNutritionData(validationData);
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
            await this.invalidateItemCache(id);

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
     *
     * @param id - UUID of the food item to delete
     * @throws FoodItemNotFoundException if food item not found
     * @throws InternalServerErrorException if database operation fails
     */
    async deleteFoodItem(id: string): Promise<void> {
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
            await this.invalidateItemCache(id);
        } catch (error) {
            if (error instanceof FoodItemNotFoundException) {
                throw error;
            }

            this.logger.error(`Failed to delete food item ${id}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to delete food item');
        }
    }

    // ==================== PRIVATE HELPER METHODS ====================

    /**
     * Convert Prisma FoodItem to response DTO with Decimal to number conversion
     */
    private toFoodItemDto(foodItem: FoodItem): FoodItemResponseDto {
        return {
            id: foodItem.id,
            name: foodItem.name,
            brand: foodItem.brand,
            servingG: foodItem.servingG ?? 0, // servingG is Int?, not Decimal
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
     * Validate nutrition data consistency
     * Delegates to centralized ValidationService
     */
    private validateNutritionData(data: {
        calories: number;
        proteinG: number;
        carbsG: number;
        fatsG: number;
    }): void {
        try {
            this.validationService.validateNutritionData(data);
        } catch (error) {
            throw new InvalidFoodItemDataException(error.message);
        }
    }

    /**
     * Invalidate food items cache
     */
    private async invalidateFoodCache(): Promise<void> {
        const cacheKey = this.configService.get<string>('cache.keys.foodItems') || 'food-items-all';
        await this.cacheManager.del(cacheKey);
        this.logger.debug('Invalidated food items cache');
    }

    /**
     * Invalidate specific food item cache by ID
     */
    private async invalidateItemCache(id: string): Promise<void> {
        const cacheKey = `food-item:/nutrition/foods/${id}`;
        await this.cacheManager.del(cacheKey);
        this.logger.debug(`Invalidated cache for food item ${id}`);
    }
}
