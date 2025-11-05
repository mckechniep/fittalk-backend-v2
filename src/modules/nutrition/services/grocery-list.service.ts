import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { OwnershipValidator } from '../../../common/services/ownership-validator.service';
import { Prisma, GroceryList, GroceryItem, FoodItem } from '@prisma/client';
import { CreateGroceryListDto } from '../dtos/create-grocery-list.dto';
import { UpdateGroceryListDto } from '../dtos/update-grocery-list.dto';
import { GroceryListResponseDto } from '../dtos/grocery-list-response.dto';
import {
    GroceryListNotFoundException,
    GroceryListNotOwnedException,
} from '../../../common/exceptions/nutrition.exceptions';
import { decimalToNumber } from '../types/prisma-to-dto.types';

/**
 * Type for GroceryList with nested relations
 */
type PrismaGroceryList = GroceryList & {
    items: (GroceryItem & {
        foodItem: FoodItem | null;
    })[];
};

/**
 * Grocery List Service
 *
 * Handles all business logic for grocery lists and items.
 *
 * Responsibilities:
 * - CRUD operations for grocery lists
 * - Nested grocery item management
 * - Ownership validation
 * - Transaction-based updates (delete + recreate pattern)
 * - Soft-delete support
 *
 * Design principles:
 * - Single Responsibility: Only manages grocery lists
 * - Transaction safety for multi-step operations
 * - Proper error handling with Prisma error codes
 * - Centralized ownership validation
 */
@Injectable()
export class GroceryListService {
    private readonly logger = new Logger(GroceryListService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly ownershipValidator: OwnershipValidator,
        private readonly configService: ConfigService,
    ) {}

    /**
     * Create a new grocery list with items
     *
     * @param userId - ID of the user
     * @param dto - Grocery list creation data with items
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
     *
     * @param id - UUID of the grocery list
     * @param userId - ID of the user (for ownership verification)
     * @throws GroceryListNotFoundException if list not found
     * @throws GroceryListNotOwnedException if user doesn't own the list
     * @throws InternalServerErrorException if database operation fails
     */
    async deleteGroceryList(id: string, userId: string): Promise<void> {
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

    // ==================== PRIVATE HELPER METHODS ====================

    /**
     * Convert Prisma GroceryList to response DTO with nested foodItem conversion
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
                isChecked: Boolean(item.isChecked),
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
                foodItem: item.foodItem ? this.toFoodItemDto(item.foodItem) : null,
            })),
        };
    }

    /**
     * Convert Prisma FoodItem to response DTO
     */
    private toFoodItemDto(foodItem: FoodItem) {
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
}
