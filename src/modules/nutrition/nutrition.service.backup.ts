// nutrition.service.ts
import {
    Injectable,
    NotFoundException,
    ForbiddenException,
    Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFoodItemDto } from './dtos/create-food-item.dto';
import { UpdateFoodItemDto } from './dtos/update-food-item.dto';
import { CreateMealLogDto } from './dtos/create-meal-log.dto';
import { UpdateMealLogDto } from './dtos/update-meal-log.dto';
import { GetMealLogsQueryDto } from './dtos/get-meal-logs-query.dto';
import { CreateMacroTargetDto } from './dtos/create-macro-target.dto';
import { UpdateMacroTargetDto } from './dtos/update-macro-target.dto';
import { CreateGroceryListDto } from './dtos/create-grocery-list.dto';
import { UpdateGroceryListDto } from './dtos/update-grocery-list.dto';

/**
 * Nutrition Service
 *
 * Business logic for nutrition tracking:
 * - Food items database management
 * - Meal logging and tracking
 * - Macro targets management
 * - Grocery lists management
 */
@Injectable()
export class NutritionService {
    private readonly logger = new Logger(NutritionService.name);

    constructor(private prisma: PrismaService) { }

    // ==================== FOOD ITEMS ====================

    /**
     * Create a new food item in the database
     */
    async createFoodItem(userId: string, dto: CreateFoodItemDto) {
        this.logger.log(`Creating food item: ${dto.name}`);

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

        this.logger.log(`Successfully created food item ${foodItem.id}`);
        return foodItem;
    }

    /**
     * Get all food items with optional search and tag filtering
     */
    async getFoodItems(search?: string, tags?: string) {
        const where: any = {};

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

        return this.prisma.foodItem.findMany({
            where,
            orderBy: { name: 'asc' },
        });
    }

    /**
     * Get a single food item by ID
     */
    async getFoodItem(id: string) {
        const foodItem = await this.prisma.foodItem.findUnique({
            where: { id },
        });

        if (!foodItem) {
            throw new NotFoundException(`Food item ${id} not found`);
        }

        return foodItem;
    }

    /**
     * Update a food item
     */
    async updateFoodItem(id: string, dto: UpdateFoodItemDto) {
        await this.getFoodItem(id); // Verify exists

        this.logger.log(`Updating food item ${id}`);

        return this.prisma.foodItem.update({
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
    }

    /**
     * Delete a food item
     */
    async deleteFoodItem(id: string) {
        await this.getFoodItem(id); // Verify exists

        this.logger.log(`Deleting food item ${id}`);

        await this.prisma.foodItem.delete({
            where: { id },
        });
    }

    // ==================== MEAL LOGS ====================
    // NOTE: These methods are placeholders until MealLog and MealEntry tables are added to the schema

    /**
     * Create a new meal log
     */
    async createMealLog(userId: string, dto: CreateMealLogDto) {
        this.logger.log(`Creating meal log for user ${userId}`);

        // TODO: Implement when MealLog and MealEntry tables are added to schema
        // Will need to create meal log + all food entries atomically
        throw new Error('Meal logging not yet implemented - pending schema migration');
    }

    /**
     * Get user's meal logs with filtering
     */
    async getUserMealLogs(userId: string, query: GetMealLogsQueryDto) {
        // TODO: Implement when MealLog table is added to schema
        throw new Error('Meal logging not yet implemented - pending schema migration');
    }

    /**
     * Get a single meal log by ID
     */
    async getMealLog(id: string, userId: string) {
        // TODO: Implement when MealLog table is added to schema
        throw new Error('Meal logging not yet implemented - pending schema migration');
    }

    /**
     * Update a meal log
     */
    async updateMealLog(id: string, userId: string, dto: UpdateMealLogDto) {
        // TODO: Implement when MealLog table is added to schema
        throw new Error('Meal logging not yet implemented - pending schema migration');
    }

    /**
     * Delete a meal log
     */
    async deleteMealLog(id: string, userId: string) {
        // TODO: Implement when MealLog table is added to schema
        throw new Error('Meal logging not yet implemented - pending schema migration');
    }

    // ==================== MACRO TARGETS ====================

    /**
     * Create a new macro target
     */
    async createMacroTarget(userId: string, dto: CreateMacroTargetDto) {
        this.logger.log(`Creating macro target for user ${userId}`);

        const macroTarget = await this.prisma.macroTarget.create({
            data: {
                userId,
                calories: dto.calories,
                proteinG: dto.proteinG,
                carbsG: dto.carbsG,
                fatsG: dto.fatsG,
                startsOn: dto.startsOn || new Date(),
                endsOn: dto.endsOn,
            },
        });

        this.logger.log(`Successfully created macro target ${macroTarget.id}`);
        return macroTarget;
    }

    /**
     * Get user's current active macro target
     */
    async getCurrentMacroTarget(userId: string) {
        const now = new Date();

        const macroTarget = await this.prisma.macroTarget.findFirst({
            where: {
                userId,
                startsOn: { lte: now },
                OR: [
                    { endsOn: null },
                    { endsOn: { gte: now } },
                ],
            },
            orderBy: { startsOn: 'desc' },
        });

        if (!macroTarget) {
            throw new NotFoundException('No active macro target found');
        }

        return macroTarget;
    }

    /**
     * Get all user's macro targets (history)
     */
    async getUserMacroTargets(userId: string) {
        return this.prisma.macroTarget.findMany({
            where: { userId },
            orderBy: { startsOn: 'desc' },
        });
    }

    /**
     * Update a macro target
     */
    async updateMacroTarget(
        id: string,
        userId: string,
        dto: UpdateMacroTargetDto,
    ) {
        const macroTarget = await this.prisma.macroTarget.findUnique({
            where: { id },
        });

        if (!macroTarget) {
            throw new NotFoundException(`Macro target ${id} not found`);
        }

        if (macroTarget.userId !== userId) {
            throw new ForbiddenException('You do not own this macro target');
        }

        this.logger.log(`Updating macro target ${id}`);

        return this.prisma.macroTarget.update({
            where: { id },
            data: {
                ...(dto.calories !== undefined && { calories: dto.calories }),
                ...(dto.proteinG !== undefined && { proteinG: dto.proteinG }),
                ...(dto.carbsG !== undefined && { carbsG: dto.carbsG }),
                ...(dto.fatsG !== undefined && { fatsG: dto.fatsG }),
                ...(dto.startsOn !== undefined && { startsOn: dto.startsOn }),
                ...(dto.endsOn !== undefined && { endsOn: dto.endsOn }),
            },
        });
    }

    /**
     * Delete a macro target
     */
    async deleteMacroTarget(id: string, userId: string) {
        const macroTarget = await this.prisma.macroTarget.findUnique({
            where: { id },
        });

        if (!macroTarget) {
            throw new NotFoundException(`Macro target ${id} not found`);
        }

        if (macroTarget.userId !== userId) {
            throw new ForbiddenException('You do not own this macro target');
        }

        this.logger.log(`Deleting macro target ${id}`);

        await this.prisma.macroTarget.delete({
            where: { id },
        });
    }

    // ==================== GROCERY LISTS ====================

    /**
     * Create a new grocery list
     */
    async createGroceryList(userId: string, dto: CreateGroceryListDto) {
        this.logger.log(`Creating grocery list for user ${userId}`);

        const groceryList = await this.prisma.groceryList.create({
            data: {
                userId,
                title: dto.title,
                weekOf: dto.weekOf,
                items: {
                    create: dto.items?.map((item) => ({
                        foodItemId: item.foodItemId,
                        name: item.name,
                        quantity: item.quantity,
                        isChecked: false,
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
        return groceryList;
    }

    /**
     * Get all user's grocery lists
     */
    async getUserGroceryLists(userId: string) {
        return this.prisma.groceryList.findMany({
            where: { userId },
            include: {
                items: {
                    include: {
                        foodItem: true,
                    },
                },
            },
            orderBy: { weekOf: 'desc' },
        });
    }

    /**
     * Get a single grocery list by ID
     */
    async getGroceryList(id: string, userId: string) {
        const groceryList = await this.prisma.groceryList.findUnique({
            where: { id },
            include: {
                items: {
                    include: {
                        foodItem: true,
                    },
                },
            },
        });

        if (!groceryList) {
            throw new NotFoundException(`Grocery list ${id} not found`);
        }

        if (groceryList.userId !== userId) {
            throw new ForbiddenException('You do not own this grocery list');
        }

        return groceryList;
    }

    /**
     * Update a grocery list
     */
    async updateGroceryList(
        id: string,
        userId: string,
        dto: UpdateGroceryListDto,
    ) {
        const groceryList = await this.prisma.groceryList.findUnique({
            where: { id },
        });

        if (!groceryList) {
            throw new NotFoundException(`Grocery list ${id} not found`);
        }

        if (groceryList.userId !== userId) {
            throw new ForbiddenException('You do not own this grocery list');
        }

        this.logger.log(`Updating grocery list ${id}`);

        // Update basic fields
        const updateData: any = {};
        if (dto.title !== undefined) updateData.title = dto.title;
        if (dto.weekOf !== undefined) updateData.weekOf = dto.weekOf;

        // Handle item updates (upsert pattern)
        if (dto.items) {
            // Delete existing items and recreate (simpler than upsert)
            await this.prisma.groceryItem.deleteMany({
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

        return this.prisma.groceryList.update({
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
    }

    /**
     * Delete a grocery list
     */
    async deleteGroceryList(id: string, userId: string) {
        const groceryList = await this.prisma.groceryList.findUnique({
            where: { id },
        });

        if (!groceryList) {
            throw new NotFoundException(`Grocery list ${id} not found`);
        }

        if (groceryList.userId !== userId) {
            throw new ForbiddenException('You do not own this grocery list');
        }

        this.logger.log(`Deleting grocery list ${id}`);

        await this.prisma.groceryList.delete({
            where: { id },
        });
    }
}
