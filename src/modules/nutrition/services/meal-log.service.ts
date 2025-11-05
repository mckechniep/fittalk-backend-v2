import { Injectable, Logger, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { OwnershipValidator } from '../../../common/services/ownership-validator.service';
import { Prisma, MealLog, MealEntry, FoodItem } from '@prisma/client';
import { CreateMealLogDto } from '../dtos/create-meal-log.dto';
import { UpdateMealLogDto } from '../dtos/update-meal-log.dto';
import { GetMealLogsQueryDto } from '../dtos/get-meal-logs-query.dto';
import { MealLogResponseDto, PaginatedMealLogsResponseDto, MealEntryResponseDto } from '../dtos/meal-log-response.dto';
import {
    MealLogNotFoundException,
    MealLogNotOwnedException,
} from '../../../common/exceptions/nutrition.exceptions';
import { decimalToNumber } from '../types/prisma-to-dto.types';

/**
 * Type for MealLog with nested relations
 */
type PrismaMealLog = MealLog & {
    entries: (MealEntry & {
        foodItem: FoodItem;
    })[];
};

/**
 * Meal Log Service
 *
 * Handles all business logic for meal logging (nutrition tracking).
 *
 * Responsibilities:
 * - CRUD operations for meal logs
 * - Transaction-based creation with nested entries
 * - Calculate nutrition totals from entries
 * - Ownership validation
 * - Soft-delete support
 * - Pagination and filtering
 *
 * Design principles:
 * - Single Responsibility: Only manages meal logs
 * - Transaction safety: Atomic creates/updates
 * - Proper error handling with Prisma error codes
 * - Nutrition calculation from food item servings
 */
@Injectable()
export class MealLogService {
    private readonly logger = new Logger(MealLogService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly ownershipValidator: OwnershipValidator,
        private readonly configService: ConfigService,
    ) {}

    /**
     * Create a new meal log with entries
     *
     * @param userId - User ID creating the meal log
     * @param dto - Meal log creation data with nested food entries
     * @returns Promise resolving to the created meal log DTO with calculated nutrition totals
     * @throws BadRequestException if food items not found or validation fails
     * @throws InternalServerErrorException if database operation fails
     */
    async createMealLog(userId: string, dto: CreateMealLogDto): Promise<MealLogResponseDto> {
        this.logger.log(`Creating meal log for user ${userId}, meal type: ${dto.mealType}`);

        // Get transaction configuration
        const txConfig = this.configService.get('transaction.default') || {
            maxWait: 2000,
            timeout: 5000,
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        };

        try {
            const mealLog = await this.prisma.$transaction(async (tx) => {
                // Create meal log
                const log = await tx.mealLog.create({
                    data: {
                        userId,
                        mealType: dto.mealType,
                        loggedAt: dto.loggedAt ? new Date(dto.loggedAt) : new Date(),
                        notes: dto.notes || null,
                    },
                });

                // Create all meal entries
                await tx.mealEntry.createMany({
                    data: dto.foods.map((food) => ({
                        mealLogId: log.id,
                        foodItemId: food.foodItemId,
                        servings: food.servings,
                        servingG: food.servingG || null,
                    })),
                });

                // Fetch complete meal log with entries and food items
                return tx.mealLog.findUnique({
                    where: { id: log.id },
                    include: {
                        entries: {
                            include: {
                                foodItem: true,
                            },
                        },
                    },
                });
            }, txConfig);

            if (!mealLog) {
                throw new InternalServerErrorException('Failed to create meal log');
            }

            this.logger.log(`Successfully created meal log ${mealLog.id} with ${mealLog.entries.length} entries`);

            return this.toMealLogDto(mealLog as PrismaMealLog);
        } catch (error) {
            // Handle Prisma-specific errors
            if (error instanceof Prisma.PrismaClientKnownRequestError) {
                this.logger.error(`Prisma error creating meal log: ${error.code} - ${error.message}`, error.stack);

                switch (error.code) {
                    case 'P2002':
                        // Unique constraint violation
                        throw new BadRequestException({
                            message: 'A meal log with this data already exists',
                            error: 'MealLogAlreadyExists',
                        });
                    case 'P2003':
                        // Foreign key constraint violation
                        throw new BadRequestException({
                            message: 'Invalid reference to food item',
                            error: 'InvalidFoodItemReference',
                        });
                    case 'P2025':
                        // Record not found
                        throw new BadRequestException({
                            message: 'One or more food items not found',
                            error: 'FoodItemNotFound',
                        });
                    default:
                        throw new InternalServerErrorException({
                            message: 'Database operation failed',
                            error: 'DatabaseError',
                        });
                }
            }

            // Handle transaction timeout errors
            if (error instanceof Prisma.PrismaClientUnknownRequestError) {
                this.logger.error(`Transaction timeout creating meal log: ${error.message}`, error.stack);
                throw new InternalServerErrorException({
                    message: 'Operation timed out. Please try again.',
                    error: 'TransactionTimeout',
                });
            }

            // Re-throw if already a NestJS exception
            if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
                throw error;
            }

            // Generic error handling
            this.logger.error(`Failed to create meal log: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to create meal log');
        }
    }

    /**
     * Get paginated meal logs for a user with filtering
     *
     * @param userId - User ID
     * @param query - Query parameters (date range, meal type, pagination)
     * @returns Promise resolving to paginated meal logs
     * @throws InternalServerErrorException if database operation fails
     */
    async getUserMealLogs(userId: string, query: GetMealLogsQueryDto): Promise<PaginatedMealLogsResponseDto> {
        try {
            const { startDate, endDate, mealType, page = 1, limit = 20 } = query;

            const where: Prisma.MealLogWhereInput = {
                userId,
                deletedAt: null, // Exclude soft-deleted
            };

            // Date range filter
            if (startDate || endDate) {
                where.loggedAt = {};
                if (startDate) {
                    where.loggedAt.gte = new Date(startDate);
                }
                if (endDate) {
                    where.loggedAt.lt = new Date(endDate);
                }
            }

            // Meal type filter
            if (mealType) {
                where.mealType = mealType;
            }

            // Get total count for pagination
            const total = await this.prisma.mealLog.count({ where });

            // Get paginated results
            const skip = (page - 1) * limit;
            const mealLogs = await this.prisma.mealLog.findMany({
                where,
                include: {
                    entries: {
                        include: {
                            foodItem: true,
                        },
                    },
                },
                orderBy: { loggedAt: 'desc' },
                skip,
                take: limit,
            });

            this.logger.debug(`Retrieved ${mealLogs.length} meal logs for user ${userId}`);

            return {
                logs: mealLogs.map((log) => this.toMealLogDto(log as PrismaMealLog)),
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                },
            };
        } catch (error) {
            this.logger.error(`Failed to get meal logs for user ${userId}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to retrieve meal logs');
        }
    }

    /**
     * Get a single meal log by ID
     *
     * @param id - UUID of the meal log
     * @param userId - ID of the user (for ownership verification)
     * @returns Promise resolving to the meal log DTO
     * @throws MealLogNotFoundException if meal log not found or deleted
     * @throws MealLogNotOwnedException if user doesn't own the meal log
     * @throws InternalServerErrorException if database operation fails
     */
    async getMealLog(id: string, userId: string): Promise<MealLogResponseDto> {
        try {
            const mealLog = await this.prisma.mealLog.findFirst({
                where: {
                    id,
                    deletedAt: null, // Exclude soft-deleted
                },
                include: {
                    entries: {
                        include: {
                            foodItem: true,
                        },
                    },
                },
            });

            if (!mealLog) {
                this.logger.warn(`Meal log ${id} not found`);
                throw new MealLogNotFoundException(id);
            }

            // Verify ownership
            this.ownershipValidator.validateOwnership(
                mealLog,
                userId,
                'MealLog',
                id,
            );

            this.logger.debug(`Retrieved meal log ${id}`);
            return this.toMealLogDto(mealLog as PrismaMealLog);
        } catch (error) {
            if (error instanceof MealLogNotFoundException || error instanceof MealLogNotOwnedException) {
                throw error;
            }

            this.logger.error(`Failed to get meal log ${id}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to retrieve meal log');
        }
    }

    /**
     * Update a meal log
     *
     * @param id - UUID of the meal log to update
     * @param userId - ID of the user (for ownership verification)
     * @param dto - Partial meal log data for update
     * @returns Promise resolving to the updated meal log DTO
     * @throws MealLogNotFoundException if meal log not found
     * @throws MealLogNotOwnedException if user doesn't own the meal log
     * @throws InternalServerErrorException if database operation fails
     */
    async updateMealLog(id: string, userId: string, dto: UpdateMealLogDto): Promise<MealLogResponseDto> {
        try {
            // Verify ownership
            await this.getMealLog(id, userId);

            this.logger.log(`Updating meal log ${id}`);

            // Get transaction configuration
            const txConfig = this.configService.get('transaction.default') || {
                maxWait: 2000,
                timeout: 5000,
                isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            };

            // Use transaction for atomic updates with proper error handling
            return await this.prisma.$transaction(async (tx) => {
                // Update basic fields
                const updateData: Prisma.MealLogUpdateInput = {};
                if (dto.mealType !== undefined) updateData.mealType = dto.mealType;
                if (dto.loggedAt !== undefined) updateData.loggedAt = new Date(dto.loggedAt);
                if (dto.notes !== undefined) updateData.notes = dto.notes;

                // Handle entry updates (delete + recreate pattern for simplicity)
                if (dto.foods) {
                    await tx.mealEntry.deleteMany({
                        where: { mealLogId: id },
                    });

                    updateData.entries = {
                        create: dto.foods.map((food) => ({
                            foodItemId: food.foodItemId,
                            servings: food.servings,
                            servingG: food.servingG || null,
                        })),
                    };
                }

                const updated = await tx.mealLog.update({
                    where: { id },
                    data: updateData,
                    include: {
                        entries: {
                            include: {
                                foodItem: true,
                            },
                        },
                    },
                });

                return this.toMealLogDto(updated as PrismaMealLog);
            }, txConfig);
        } catch (error) {
            // Re-throw domain exceptions
            if (error instanceof MealLogNotFoundException || error instanceof MealLogNotOwnedException) {
                throw error;
            }

            // Handle Prisma-specific errors
            if (error instanceof Prisma.PrismaClientKnownRequestError) {
                this.logger.error(`Prisma error updating meal log ${id}: ${error.code} - ${error.message}`, error.stack);

                switch (error.code) {
                    case 'P2002':
                        // Unique constraint violation
                        throw new InternalServerErrorException({
                            message: 'A meal log with this data already exists',
                            error: 'MealLogAlreadyExists',
                        });
                    case 'P2025':
                        // Record not found during update
                        throw new MealLogNotFoundException(id);
                    default:
                        throw new InternalServerErrorException({
                            message: 'Database operation failed',
                            error: 'DatabaseError',
                        });
                }
            }

            // Handle transaction timeout errors
            if (error instanceof Prisma.PrismaClientUnknownRequestError) {
                this.logger.error(`Transaction timeout updating meal log ${id}: ${error.message}`, error.stack);
                throw new InternalServerErrorException({
                    message: 'Operation timed out. Please try again.',
                    error: 'TransactionTimeout',
                });
            }

            // Re-throw if already a NestJS exception
            if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
                throw error;
            }

            // Generic error handling
            this.logger.error(`Failed to update meal log ${id}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to update meal log');
        }
    }

    /**
     * Soft delete a meal log
     *
     * @param id - UUID of the meal log to delete
     * @param userId - ID of the user (for ownership verification)
     * @throws MealLogNotFoundException if meal log not found
     * @throws MealLogNotOwnedException if user doesn't own the meal log
     * @throws InternalServerErrorException if database operation fails
     */
    async deleteMealLog(id: string, userId: string): Promise<void> {
        try {
            // Verify ownership
            await this.getMealLog(id, userId);

            this.logger.log(`Soft deleting meal log ${id}`);

            await this.prisma.mealLog.update({
                where: { id },
                data: { deletedAt: new Date() },
            });

            this.logger.log(`Successfully soft-deleted meal log ${id}`);
        } catch (error) {
            if (error instanceof MealLogNotFoundException || error instanceof MealLogNotOwnedException) {
                throw error;
            }

            this.logger.error(`Failed to delete meal log ${id}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to delete meal log');
        }
    }

    // ==================== PRIVATE HELPER METHODS ====================

    /**
     * Convert Prisma MealLog to response DTO with nutrition calculations
     */
    private toMealLogDto(mealLog: PrismaMealLog): MealLogResponseDto {
        // Calculate nutrition totals from entries
        let totalCalories = 0;
        let totalProteinG = 0;
        let totalCarbsG = 0;
        let totalFatsG = 0;

        const entries: MealEntryResponseDto[] = mealLog.entries.map((entry) => {
            const foodItem = entry.foodItem;
            const servingsNum = decimalToNumber(entry.servings);

            // Calculate nutrition for this entry
            totalCalories += foodItem.calories * servingsNum;
            totalProteinG += decimalToNumber(foodItem.proteinG) * servingsNum;
            totalCarbsG += decimalToNumber(foodItem.carbsG) * servingsNum;
            totalFatsG += decimalToNumber(foodItem.fatsG) * servingsNum;

            return {
                id: entry.id,
                mealLogId: entry.mealLogId,
                foodItemId: entry.foodItemId,
                foodItem: {
                    id: foodItem.id,
                    name: foodItem.name,
                    brand: foodItem.brand,
                    servingG: foodItem.servingG ?? 0,
                    calories: foodItem.calories,
                    proteinG: decimalToNumber(foodItem.proteinG),
                    carbsG: decimalToNumber(foodItem.carbsG),
                    fatsG: decimalToNumber(foodItem.fatsG),
                    tags: foodItem.tags,
                    source: foodItem.source,
                    createdAt: foodItem.createdAt,
                    updatedAt: foodItem.updatedAt,
                },
                servings: servingsNum,
                servingG: entry.servingG,
                createdAt: entry.createdAt,
            };
        });

        return {
            id: mealLog.id,
            userId: mealLog.userId,
            mealType: mealLog.mealType,
            loggedAt: mealLog.loggedAt,
            notes: mealLog.notes,
            entries,
            totalCalories: Math.round(totalCalories),
            totalProteinG: Math.round(totalProteinG * 10) / 10, // 1 decimal place
            totalCarbsG: Math.round(totalCarbsG * 10) / 10,
            totalFatsG: Math.round(totalFatsG * 10) / 10,
            createdAt: mealLog.createdAt,
            updatedAt: mealLog.updatedAt,
        };
    }
}
