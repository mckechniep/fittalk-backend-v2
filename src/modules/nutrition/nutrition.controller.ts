// nutrition.controller.ts
import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    HttpCode,
    HttpStatus,
    UseGuards,
    UseInterceptors,
    UsePipes,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiParam,
    ApiQuery,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { NutritionService } from './nutrition.service';
import { FoodItemService } from './services/food-item.service';
import { MacroTargetService } from './services/macro-target.service';
import { GroceryListService } from './services/grocery-list.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CacheKey } from '../../common/decorators/cache-key.decorator';
import { AuditEntity } from '../../common/decorators/audit-entity.decorator';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor';
import { AuditLoggingInterceptor } from '../../common/interceptors/audit-logging.interceptor';
import { PerformanceInterceptor } from '../../common/interceptors/performance.interceptor';
import { HttpCacheInterceptor } from '../../common/interceptors/cache.interceptor';
import { SanitizationPipe } from '../../common/pipes/sanitization.pipe';
import { CreateFoodItemDto } from './dtos/create-food-item.dto';
import { UpdateFoodItemDto } from './dtos/update-food-item.dto';
import { CreateMealLogDto } from './dtos/create-meal-log.dto';
import { UpdateMealLogDto } from './dtos/update-meal-log.dto';
import { GetMealLogsQueryDto } from './dtos/get-meal-logs-query.dto';
import { CreateMacroTargetDto } from './dtos/create-macro-target.dto';
import { UpdateMacroTargetDto } from './dtos/update-macro-target.dto';
import { CreateGroceryListDto } from './dtos/create-grocery-list.dto';
import { UpdateGroceryListDto } from './dtos/update-grocery-list.dto';
import { FoodItemResponseDto } from './dtos/food-item-response.dto';
import { MacroTargetResponseDto } from './dtos/macro-target-response.dto';
import { GroceryListResponseDto } from './dtos/grocery-list-response.dto';
import { MealLogResponseDto, PaginatedMealLogsResponseDto } from './dtos/meal-log-response.dto';

/**
 * Nutrition Controller
 *
 * Senior-level HTTP endpoint handler with:
 * - OpenAPI/Swagger documentation
 * - Response DTOs for data transformation
 * - Audit logging for all mutations
 * - Performance monitoring
 * - HTTP caching for GET requests
 * - Rate limiting per endpoint
 * - XSS sanitization on inputs
 *
 * All endpoints require JWT authentication.
 */
@ApiTags('Nutrition')
@ApiBearerAuth()
@Controller('nutrition')
@UseGuards(JwtAuthGuard)
@UseInterceptors(
    AuditLoggingInterceptor,
    PerformanceInterceptor,
    HttpCacheInterceptor
)
@UsePipes(new SanitizationPipe())
export class NutritionController {
    constructor(
        private readonly nutritionService: NutritionService,
        private readonly foodItemService: FoodItemService,
        private readonly macroTargetService: MacroTargetService,
        private readonly groceryListService: GroceryListService,
    ) { }

    // ==================== FOOD ITEMS ====================

    @Post('foods')
    @AuditEntity('FoodItem') // Enable audit logging for FoodItem entity
    @HttpCode(HttpStatus.CREATED)
    @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
    @UseInterceptors(new TransformInterceptor(FoodItemResponseDto))
    @ApiOperation({
        summary: 'Create a new food item',
        description: 'Add a new food item to the database with nutritional information'
    })
    @ApiResponse({
        status: 201,
        description: 'Food item created successfully',
        type: FoodItemResponseDto
    })
    @ApiResponse({ status: 400, description: 'Invalid food data or validation error' })
    @ApiResponse({ status: 401, description: 'Unauthorized - JWT token missing or invalid' })
    async createFoodItem(
        @CurrentUser('id') userId: string,
        @Body() dto: CreateFoodItemDto,
    ): Promise<FoodItemResponseDto> {
        return this.foodItemService.createFoodItem(userId, dto);
    }

    @Get('foods')
    @CacheKey('food-items-all', 3600) // Cache for 1 hour
    @Throttle({ default: { limit: 100, ttl: 60000 } }) // 100 requests per minute
    @UseInterceptors(new TransformInterceptor(FoodItemResponseDto))
    @ApiOperation({
        summary: 'Get all food items',
        description: 'Retrieve food items with optional search and tag filtering'
    })
    @ApiQuery({ name: 'search', required: false, description: 'Search by food name' })
    @ApiQuery({ name: 'tags', required: false, description: 'Filter by tags (comma-separated)' })
    @ApiResponse({
        status: 200,
        description: 'Food items retrieved successfully',
        type: [FoodItemResponseDto]
    })
    async getFoodItems(
        @Query('search') search?: string,
        @Query('tags') tags?: string,
    ): Promise<FoodItemResponseDto[]> {
        return this.foodItemService.getFoodItems(search, tags);
    }

    @Get('foods/:id')
    @CacheKey('food-item', 3600)
    @Throttle({ default: { limit: 100, ttl: 60000 } })
    @UseInterceptors(new TransformInterceptor(FoodItemResponseDto))
    @ApiOperation({
        summary: 'Get single food item',
        description: 'Retrieve a specific food item by ID'
    })
    @ApiParam({ name: 'id', description: 'Food item UUID' })
    @ApiResponse({
        status: 200,
        description: 'Food item retrieved successfully',
        type: FoodItemResponseDto
    })
    @ApiResponse({ status: 404, description: 'Food item not found' })
    async getFoodItem(@Param('id') id: string): Promise<FoodItemResponseDto> {
        return this.foodItemService.getFoodItem(id);
    }

    @Patch('foods/:id')
    @Throttle({ default: { limit: 20, ttl: 60000 } })
    @UseInterceptors(new TransformInterceptor(FoodItemResponseDto))
    @ApiOperation({
        summary: 'Update a food item',
        description: 'Partially update a food item\'s information'
    })
    @ApiParam({ name: 'id', description: 'Food item UUID' })
    @ApiResponse({
        status: 200,
        description: 'Food item updated successfully',
        type: FoodItemResponseDto
    })
    @ApiResponse({ status: 404, description: 'Food item not found' })
    async updateFoodItem(
        @Param('id') id: string,
        @Body() dto: UpdateFoodItemDto,
    ): Promise<FoodItemResponseDto> {
        return this.foodItemService.updateFoodItem(id, dto);
    }

    @Delete('foods/:id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @Throttle({ default: { limit: 20, ttl: 60000 } })
    @ApiOperation({
        summary: 'Delete a food item',
        description: 'Soft delete a food item (can be restored)'
    })
    @ApiParam({ name: 'id', description: 'Food item UUID' })
    @ApiResponse({ status: 204, description: 'Food item deleted successfully' })
    @ApiResponse({ status: 404, description: 'Food item not found' })
    async deleteFoodItem(@Param('id') id: string): Promise<void> {
        return this.foodItemService.deleteFoodItem(id);
    }

    // ==================== MEAL LOGS ====================

    @Post('meals')
    @HttpCode(HttpStatus.CREATED)
    @Throttle({ default: { limit: 30, ttl: 60000 } })
    @UseInterceptors(new TransformInterceptor(MealLogResponseDto))
    @ApiOperation({
        summary: 'Create a meal log',
        description: 'Log a meal with food entries and calculate nutritional totals'
    })
    @ApiResponse({
        status: 201,
        description: 'Meal log created successfully',
        type: MealLogResponseDto
    })
    @ApiResponse({ status: 400, description: 'Invalid meal data or empty meal' })
    async createMealLog(
        @CurrentUser('id') userId: string,
        @Body() dto: CreateMealLogDto,
    ): Promise<MealLogResponseDto> {
        return this.nutritionService.createMealLog(userId, dto);
    }

    @Get('meals')
    @Throttle({ default: { limit: 100, ttl: 60000 } })
    @UseInterceptors(new TransformInterceptor(MealLogResponseDto))
    @ApiOperation({
        summary: 'Get meal logs',
        description: 'Retrieve user\'s meal logs with filtering and pagination'
    })
    @ApiQuery({ name: 'mealType', required: false, description: 'Filter by meal type' })
    @ApiQuery({ name: 'startDate', required: false, description: 'Start date (ISO 8601)' })
    @ApiQuery({ name: 'endDate', required: false, description: 'End date (ISO 8601)' })
    @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
    @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 20, max: 100)' })
    @ApiResponse({
        status: 200,
        description: 'Meal logs retrieved successfully',
        type: PaginatedMealLogsResponseDto
    })
    async getMealLogs(
        @CurrentUser('id') userId: string,
        @Query() query: GetMealLogsQueryDto,
    ): Promise<PaginatedMealLogsResponseDto> {
        return this.nutritionService.getUserMealLogs(userId, query);
    }

    @Get('meals/:id')
    @Throttle({ default: { limit: 100, ttl: 60000 } })
    @UseInterceptors(new TransformInterceptor(MealLogResponseDto))
    @ApiOperation({
        summary: 'Get single meal log',
        description: 'Retrieve a specific meal log by ID'
    })
    @ApiParam({ name: 'id', description: 'Meal log UUID' })
    @ApiResponse({
        status: 200,
        description: 'Meal log retrieved successfully',
        type: MealLogResponseDto
    })
    @ApiResponse({ status: 404, description: 'Meal log not found' })
    @ApiResponse({ status: 403, description: 'Forbidden - meal log not owned by user' })
    async getMealLog(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
    ): Promise<MealLogResponseDto> {
        return this.nutritionService.getMealLog(id, userId);
    }

    @Patch('meals/:id')
    @Throttle({ default: { limit: 30, ttl: 60000 } })
    @UseInterceptors(new TransformInterceptor(MealLogResponseDto))
    @ApiOperation({
        summary: 'Update a meal log',
        description: 'Partially update a meal log and its food entries'
    })
    @ApiParam({ name: 'id', description: 'Meal log UUID' })
    @ApiResponse({
        status: 200,
        description: 'Meal log updated successfully',
        type: MealLogResponseDto
    })
    @ApiResponse({ status: 404, description: 'Meal log not found' })
    @ApiResponse({ status: 403, description: 'Forbidden - meal log not owned by user' })
    async updateMealLog(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
        @Body() dto: UpdateMealLogDto,
    ): Promise<MealLogResponseDto> {
        return this.nutritionService.updateMealLog(id, userId, dto);
    }

    @Delete('meals/:id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @Throttle({ default: { limit: 30, ttl: 60000 } })
    @ApiOperation({
        summary: 'Delete a meal log',
        description: 'Soft delete a meal log (can be restored)'
    })
    @ApiParam({ name: 'id', description: 'Meal log UUID' })
    @ApiResponse({ status: 204, description: 'Meal log deleted successfully' })
    @ApiResponse({ status: 404, description: 'Meal log not found' })
    @ApiResponse({ status: 403, description: 'Forbidden - meal log not owned by user' })
    async deleteMealLog(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
    ): Promise<void> {
        return this.nutritionService.deleteMealLog(id, userId);
    }

    // ==================== MACRO TARGETS ====================

    @Post('targets')
    @HttpCode(HttpStatus.CREATED)
    @Throttle({ default: { limit: 10, ttl: 60000 } })
    @UseInterceptors(new TransformInterceptor(MacroTargetResponseDto))
    @ApiOperation({
        summary: 'Create a macro target',
        description: 'Set nutrition goals (calories, protein, carbs, fats)'
    })
    @ApiResponse({
        status: 201,
        description: 'Macro target created successfully',
        type: MacroTargetResponseDto
    })
    @ApiResponse({ status: 400, description: 'Invalid macro target data' })
    async createMacroTarget(
        @CurrentUser('id') userId: string,
        @Body() dto: CreateMacroTargetDto,
    ): Promise<MacroTargetResponseDto> {
        return this.macroTargetService.createMacroTarget(userId, dto);
    }

    @Get('targets/current')
    @CacheKey('current-macro-target', 300) // Cache for 5 minutes
    @Throttle({ default: { limit: 100, ttl: 60000 } })
    @UseInterceptors(new TransformInterceptor(MacroTargetResponseDto))
    @ApiOperation({
        summary: 'Get current macro target',
        description: 'Retrieve the currently active macro target'
    })
    @ApiResponse({
        status: 200,
        description: 'Current macro target retrieved successfully',
        type: MacroTargetResponseDto
    })
    @ApiResponse({ status: 404, description: 'No active macro target found' })
    async getCurrentMacroTarget(
        @CurrentUser('id') userId: string
    ): Promise<MacroTargetResponseDto> {
        return this.macroTargetService.getCurrentMacroTarget(userId);
    }

    @Get('targets')
    @CacheKey('macro-targets-all', 600) // Cache for 10 minutes
    @Throttle({ default: { limit: 100, ttl: 60000 } })
    @UseInterceptors(new TransformInterceptor(MacroTargetResponseDto))
    @ApiOperation({
        summary: 'Get all macro targets',
        description: 'Retrieve all macro targets (history)'
    })
    @ApiResponse({
        status: 200,
        description: 'Macro targets retrieved successfully',
        type: [MacroTargetResponseDto]
    })
    async getMacroTargets(
        @CurrentUser('id') userId: string
    ): Promise<MacroTargetResponseDto[]> {
        return this.macroTargetService.getUserMacroTargets(userId);
    }

    @Patch('targets/:id')
    @Throttle({ default: { limit: 20, ttl: 60000 } })
    @UseInterceptors(new TransformInterceptor(MacroTargetResponseDto))
    @ApiOperation({
        summary: 'Update a macro target',
        description: 'Partially update a macro target'
    })
    @ApiParam({ name: 'id', description: 'Macro target UUID' })
    @ApiResponse({
        status: 200,
        description: 'Macro target updated successfully',
        type: MacroTargetResponseDto
    })
    @ApiResponse({ status: 404, description: 'Macro target not found' })
    @ApiResponse({ status: 403, description: 'Forbidden - macro target not owned by user' })
    async updateMacroTarget(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
        @Body() dto: UpdateMacroTargetDto,
    ): Promise<MacroTargetResponseDto> {
        return this.macroTargetService.updateMacroTarget(id, userId, dto);
    }

    @Delete('targets/:id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @Throttle({ default: { limit: 20, ttl: 60000 } })
    @ApiOperation({
        summary: 'Delete a macro target',
        description: 'Soft delete a macro target (can be restored)'
    })
    @ApiParam({ name: 'id', description: 'Macro target UUID' })
    @ApiResponse({ status: 204, description: 'Macro target deleted successfully' })
    @ApiResponse({ status: 404, description: 'Macro target not found' })
    @ApiResponse({ status: 403, description: 'Forbidden - macro target not owned by user' })
    async deleteMacroTarget(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
    ): Promise<void> {
        return this.macroTargetService.deleteMacroTarget(id, userId);
    }

    // ==================== GROCERY LISTS ====================

    @Post('grocery-lists')
    @HttpCode(HttpStatus.CREATED)
    @Throttle({ default: { limit: 20, ttl: 60000 } })
    @UseInterceptors(new TransformInterceptor(GroceryListResponseDto))
    @ApiOperation({
        summary: 'Create a grocery list',
        description: 'Create a new grocery list with items'
    })
    @ApiResponse({
        status: 201,
        description: 'Grocery list created successfully',
        type: GroceryListResponseDto
    })
    @ApiResponse({ status: 400, description: 'Invalid grocery list data' })
    async createGroceryList(
        @CurrentUser('id') userId: string,
        @Body() dto: CreateGroceryListDto,
    ): Promise<GroceryListResponseDto> {
        return this.groceryListService.createGroceryList(userId, dto);
    }

    @Get('grocery-lists')
    @Throttle({ default: { limit: 100, ttl: 60000 } })
    @UseInterceptors(new TransformInterceptor(GroceryListResponseDto))
    @ApiOperation({
        summary: 'Get all grocery lists',
        description: 'Retrieve all grocery lists for the user'
    })
    @ApiResponse({
        status: 200,
        description: 'Grocery lists retrieved successfully',
        type: [GroceryListResponseDto]
    })
    async getGroceryLists(
        @CurrentUser('id') userId: string
    ): Promise<GroceryListResponseDto[]> {
        return this.groceryListService.getUserGroceryLists(userId);
    }

    @Get('grocery-lists/:id')
    @Throttle({ default: { limit: 100, ttl: 60000 } })
    @UseInterceptors(new TransformInterceptor(GroceryListResponseDto))
    @ApiOperation({
        summary: 'Get single grocery list',
        description: 'Retrieve a specific grocery list by ID'
    })
    @ApiParam({ name: 'id', description: 'Grocery list UUID' })
    @ApiResponse({
        status: 200,
        description: 'Grocery list retrieved successfully',
        type: GroceryListResponseDto
    })
    @ApiResponse({ status: 404, description: 'Grocery list not found' })
    @ApiResponse({ status: 403, description: 'Forbidden - grocery list not owned by user' })
    async getGroceryList(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
    ): Promise<GroceryListResponseDto> {
        return this.groceryListService.getGroceryList(id, userId);
    }

    @Patch('grocery-lists/:id')
    @Throttle({ default: { limit: 30, ttl: 60000 } })
    @UseInterceptors(new TransformInterceptor(GroceryListResponseDto))
    @ApiOperation({
        summary: 'Update a grocery list',
        description: 'Partially update a grocery list and its items'
    })
    @ApiParam({ name: 'id', description: 'Grocery list UUID' })
    @ApiResponse({
        status: 200,
        description: 'Grocery list updated successfully',
        type: GroceryListResponseDto
    })
    @ApiResponse({ status: 404, description: 'Grocery list not found' })
    @ApiResponse({ status: 403, description: 'Forbidden - grocery list not owned by user' })
    async updateGroceryList(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
        @Body() dto: UpdateGroceryListDto,
    ): Promise<GroceryListResponseDto> {
        return this.groceryListService.updateGroceryList(id, userId, dto);
    }

    @Delete('grocery-lists/:id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @Throttle({ default: { limit: 30, ttl: 60000 } })
    @ApiOperation({
        summary: 'Delete a grocery list',
        description: 'Soft delete a grocery list (can be restored)'
    })
    @ApiParam({ name: 'id', description: 'Grocery list UUID' })
    @ApiResponse({ status: 204, description: 'Grocery list deleted successfully' })
    @ApiResponse({ status: 404, description: 'Grocery list not found' })
    @ApiResponse({ status: 403, description: 'Forbidden - grocery list not owned by user' })
    async deleteGroceryList(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
    ): Promise<void> {
        return this.groceryListService.deleteGroceryList(id, userId);
    }
}
