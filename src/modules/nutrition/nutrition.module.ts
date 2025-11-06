// nutrition.module.ts
import { Module } from '@nestjs/common';
import { NutritionController } from './nutrition.controller';
import { FoodItemService } from './services/food-item.service';
import { MacroTargetService } from './services/macro-target.service';
import { GroceryListService } from './services/grocery-list.service';
import { MealLogService } from './services/meal-log.service';
import { PrismaModule } from '../../prisma/prisma.module';

/**
 * Nutrition Module
 *
 * Encapsulates all nutrition tracking and food management functionality.
 *
 * Responsibilities:
 * - Manage food items database with nutritional information
 * - Log meals and track daily nutrition intake
 * - Track macro and calorie targets
 * - Manage grocery lists
 * - Provide nutrition history and analytics
 *
 * Controller:
 * - NutritionController: /nutrition routes (food items, meal logs, macro targets, grocery lists)
 *
 * Services:
 * - FoodItemService: Food item CRUD, caching, validation
 * - MacroTargetService: Macro target management, ownership validation
 * - GroceryListService: Grocery list CRUD, transaction handling
 * - MealLogService: Meal logging with nutrition calculations
 *
 * Dependencies:
 * - PrismaModule: Database access (@Global, provides PrismaService)
 *
 * Exports:
 * - FoodItemService: Available for AI meal recommendations
 * - MacroTargetService: Available for Goals and Analytics modules
 * - GroceryListService: Available for meal planning features
 * - MealLogService: Available for Analytics and AI modules
 *
 * Design decisions:
 * - Single controller: All nutrition operations in one place
 * - Services exported: Other modules need nutrition data
 * - Split services: Single Responsibility Principle (each service handles one domain)
 * - Combines food items, meal logging, and grocery lists in one module
 * - Uses PrismaModule: Global database access
 *
 * Integration with other modules:
 * - Goals module: Links nutrition tracking to weight/body composition goals
 * - Analytics: Queries logs for adherence tracking, macro trends
 * - AI: Uses nutrition history for personalized meal recommendations
 * - Profile: Shows "Today's nutrition: 1800/2200 calories"
 *
 * Future enhancements:
 * - Add meal templates and recipes
 * - Add barcode scanning for food lookup
 * - Add nutrition API integration (USDA, OpenFoodFacts)
 * - Add meal planning and prep features
 * - Add social sharing of meals
 */
@Module({
    imports: [
        PrismaModule, // Database access (@Global but listed for clarity)
    ],
    controllers: [
        NutritionController, // /nutrition routes
    ],
    providers: [
        FoodItemService,      // Food item CRUD
        MacroTargetService,   // Macro target management
        GroceryListService,   // Grocery list management
        MealLogService,       // Meal logging with nutrition calculations
    ],
    exports: [
        FoodItemService,      // Exported for AI meal recommendations
        MacroTargetService,   // Exported for Goals and Analytics modules
        GroceryListService,   // Exported for meal planning features
        MealLogService,       // Exported for Analytics and AI modules
    ],
})
export class NutritionModule { }
