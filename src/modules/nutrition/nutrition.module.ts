// nutrition.module.ts
import { Module } from '@nestjs/common';
import { NutritionController } from './nutrition.controller';
import { NutritionService } from './nutrition.service';
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
 * Service:
 * - NutritionService: Business logic, validation, database access
 *
 * Dependencies:
 * - PrismaModule: Database access (@Global, provides PrismaService)
 *
 * Exports:
 * - NutritionService: Available to other modules
 *   - AI module: Analyzes nutrition patterns for recommendations
 *   - Analytics module: Calculates nutrition adherence and trends
 *   - Goals module: Tracks nutrition goals progress
 *   - Profile module: Displays recent nutrition activity
 *
 * Design decisions:
 * - Single controller: All nutrition operations in one place
 * - Service exported: Other modules need nutrition data
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
        NutritionService, // Business logic
    ],
    exports: [
        NutritionService, // Available to AI, Analytics, Goals, Profile modules
    ],
})
export class NutritionModule { }
