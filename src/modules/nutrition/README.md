# Nutrition Module

The Nutrition Module handles all functionality related to food tracking, meal logging, macro targets, and grocery list management.

## Overview

This module encapsulates nutrition tracking functionality, allowing users to:
- Manage food items database with nutritional information
- Log meals and track daily food intake
- Set and track macro/calorie targets
- Create and manage grocery lists
- View nutrition history with filtering and pagination

## Architecture

### Module Structure

```
src/modules/nutrition/
├── nutrition.module.ts       # Module definition
├── nutrition.controller.ts   # REST API endpoints
├── nutrition.service.ts      # Business logic
├── dtos/
│   ├── create-food-item.dto.ts
│   ├── update-food-item.dto.ts
│   ├── food-item-response.dto.ts
│   ├── create-meal-log.dto.ts
│   ├── update-meal-log.dto.ts
│   ├── get-meal-logs-query.dto.ts
│   ├── create-macro-target.dto.ts
│   ├── update-macro-target.dto.ts
│   ├── macro-target-response.dto.ts
│   ├── create-grocery-list.dto.ts
│   ├── update-grocery-list.dto.ts
│   └── grocery-list-response.dto.ts
├── types/
│   └── prisma-to-dto.types.ts  # Type utilities and guards
└── README.md
```

### Dependencies

- **PrismaModule**: Database access (global)
- No other module dependencies

### Exported Services

The module exports `NutritionService` for use by:
- **AI Module**: Analyzes nutrition patterns for recommendations
- **Analytics Module**: Calculates nutrition adherence and trends
- **Goals Module**: Tracks nutrition goals progress
- **Profile Module**: Displays recent nutrition activity

### Senior-Level Architecture Patterns

#### Type Safety
- **Zero `any` types**: All methods have explicit return types using Prisma-generated types
- **Prisma Decimal handling**: Custom `decimalToNumber()` utility for safe Decimal → number conversion
- **Type guards**: Runtime type checking with `isDecimal()` for defensive programming
- **Response DTOs**: Dedicated DTOs with `@Transform` decorators for runtime type safety

#### Data Transformation Layer
- **Service-level conversion**: Private helper methods (`toFoodItemDto`, `toMacroTargetDto`, `toGroceryListDto`)
- **Explicit field mapping**: Clear field-by-field conversion instead of spread operators
- **Dual-layer safety**: Service transformation + DTO Transform decorators
- **Type utilities**: `PrismaGroceryList`, `PrismaFoodItem` types for complex includes

#### Soft-Delete Pattern
- All deletions use `deletedAt` timestamp for data preservation
- Queries explicitly filter `deletedAt: null` to exclude soft-deleted records
- Maintains referential integrity and audit trail

#### Error Handling
- **Custom exceptions**: Domain-specific exceptions in `common/exceptions/nutrition.exceptions.ts`
- **Ownership validation**: All user-specific operations verify ownership
- **JSDoc documentation**: Comprehensive `@throws` documentation on all service methods

#### Performance Optimization
- **Caching**: Uses `@CacheKey` decorator for frequently accessed data
- **Cache invalidation**: Strategic cache clearing on mutations
- **Transaction usage**: Atomic operations for data consistency (grocery list updates)
- **Efficient queries**: Proper use of Prisma `include` for eager loading

## API Endpoints

All endpoints require JWT authentication via `JwtAuthGuard`.

---

## Food Items Management

### Create Food Item

```
POST /nutrition/foods
```

Creates a new food item in the database.

**Request Body:**

```json
{
  "name": "Chicken Breast",
  "brand": "Organic Valley",
  "servingG": 100,
  "calories": 165,
  "proteinG": 31,
  "carbsG": 0,
  "fatsG": 3.6,
  "tags": ["protein", "lean", "meat"]
}
```

**Response:** `201 Created`

```json
{
  "id": "uuid",
  "name": "Chicken Breast",
  "brand": "Organic Valley",
  "servingG": 100,
  "calories": 165,
  "proteinG": 31,
  "carbsG": 0,
  "fatsG": 3.6,
  "tags": ["protein", "lean", "meat"],
  "source": "user",
  "createdAt": "2025-01-20T09:00:00Z",
  "updatedAt": "2025-01-20T09:00:00Z"
}
```

**Validation:**
- `name` required (max 200 chars)
- `calories` required (0-10000)
- `proteinG`, `carbsG`, `fatsG` required (0-500g)
- `servingG` optional (1-5000g)
- `brand` optional (max 100 chars)
- `tags` optional (array of strings)

### Get Food Items

```
GET /nutrition/foods
```

Retrieves all food items with optional search and filtering.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | String | Search by food name (case-insensitive) |
| `tags` | String | Filter by tags (comma-separated) |

**Example Queries:**

```
GET /nutrition/foods?search=chicken
GET /nutrition/foods?tags=protein,lean
GET /nutrition/foods?search=rice&tags=carb
```

**Response:** `200 OK`

```json
[
  {
    "id": "uuid",
    "name": "Chicken Breast",
    "brand": "Organic Valley",
    "servingG": 100,
    "calories": 165,
    "proteinG": 31,
    "carbsG": 0,
    "fatsG": 3.6,
    "tags": ["protein", "lean", "meat"],
    "source": "user",
    "createdAt": "2025-01-20T09:00:00Z",
    "updatedAt": "2025-01-20T09:00:00Z"
  }
]
```

**Sorting:** Results sorted alphabetically by name

### Get Single Food Item

```
GET /nutrition/foods/:id
```

Fetches a single food item by ID.

**Response:** `200 OK` (same structure as create response)

### Update Food Item

```
PATCH /nutrition/foods/:id
```

Partially updates a food item.

**Request Body (all fields optional):**

```json
{
  "name": "Chicken Breast (Skinless)",
  "calories": 160,
  "tags": ["protein", "lean", "meat", "poultry"]
}
```

**Response:** `200 OK` (updated food item)

### Delete Food Item

```
DELETE /nutrition/foods/:id
```

Soft-deletes a food item by setting `deletedAt` timestamp.

**Response:** `204 No Content`

**Implementation:** Uses soft-delete pattern - item is marked as deleted but preserved in database for audit trail and data integrity.

---

## Meal Logging

> **Note:** Meal logging endpoints are currently placeholders pending database schema migration. You'll need to add `MealLog` and `MealEntry` tables to the schema first.

### Create Meal Log

```
POST /nutrition/meals
```

Creates a new meal log with food entries.

**Request Body:**

```json
{
  "mealType": "breakfast",
  "loggedAt": "2025-01-20T08:00:00Z",
  "notes": "Post-workout meal",
  "foods": [
    {
      "foodItemId": "uuid",
      "servings": 1.5,
      "servingG": 150
    },
    {
      "foodItemId": "uuid",
      "servings": 2
    }
  ]
}
```

**Response:** `201 Created`

```json
{
  "id": "uuid",
  "userId": "uuid",
  "mealType": "breakfast",
  "loggedAt": "2025-01-20T08:00:00Z",
  "notes": "Post-workout meal",
  "foods": [
    {
      "id": "uuid",
      "mealLogId": "uuid",
      "foodItemId": "uuid",
      "foodItem": { /* full food item details */ },
      "servings": 1.5,
      "servingG": 150,
      "createdAt": "2025-01-20T08:05:00Z"
    }
  ],
  "totalCalories": 330,
  "totalProteinG": 46.5,
  "totalCarbsG": 0,
  "totalFatsG": 5.4,
  "createdAt": "2025-01-20T08:05:00Z"
}
```

**Validation:**
- `mealType` required (max 50 chars): "breakfast", "lunch", "dinner", "snack"
- `foods` required (at least one food entry)
- `servings` required per food (0.1-50)
- `loggedAt` optional (defaults to now)
- `notes` optional (max 500 chars)

**Transaction:** Creates MealLog + all MealEntries atomically

### Get Meal Logs (History)

```
GET /nutrition/meals
```

Retrieves user's meal logs with filtering and pagination.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `mealType` | String | Filter by meal type |
| `startDate` | ISO 8601 | Show logs on or after this date |
| `endDate` | ISO 8601 | Show logs before this date |
| `page` | Integer | Page number (default: 1) |
| `limit` | Integer | Items per page (default: 20, max: 100) |

**Example Queries:**

```
GET /nutrition/meals?mealType=breakfast&limit=10
GET /nutrition/meals?startDate=2025-01-01&endDate=2025-01-31
GET /nutrition/meals?page=2
```

**Response:** `200 OK`

```json
{
  "logs": [
    { /* MealLog with foods */ }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 156,
    "totalPages": 8
  }
}
```

**Sorting:** Results sorted by `loggedAt` descending (newest first)

### Get Single Meal Log

```
GET /nutrition/meals/:id
```

Fetches a single meal log by ID with all food entries.

**Response:** `200 OK` (same structure as create response)

**Security:** Verifies user owns the log (403 if not)

### Update Meal Log

```
PATCH /nutrition/meals/:id
```

Partially updates a meal log.

**Request Body (all fields optional):**

```json
{
  "notes": "Actually ate at home",
  "foods": [
    {
      "foodItemId": "uuid",
      "servings": 2
    }
  ]
}
```

**Response:** `200 OK` (updated log with all foods)

**Use Cases:**
- Fix mistakes: "I meant 2 servings, not 1"
- Add forgotten foods: "I forgot to log my protein shake"
- Update notes: "Actually this was a restaurant meal"

### Delete Meal Log

```
DELETE /nutrition/meals/:id
```

Deletes a meal log and all associated food entries (cascade).

**Response:** `204 No Content`

**Security:** Verifies user owns the log (403 if not)

---

## Macro Targets Management

### Create Macro Target

```
POST /nutrition/targets
```

Creates a new macro target for the user.

**Request Body:**

```json
{
  "calories": 2200,
  "proteinG": 180,
  "carbsG": 250,
  "fatsG": 60,
  "startsOn": "2025-01-20T00:00:00Z",
  "endsOn": "2025-02-20T00:00:00Z"
}
```

**Response:** `201 Created`

```json
{
  "id": "uuid",
  "userId": "uuid",
  "calories": 2200,
  "proteinG": 180,
  "carbsG": 250,
  "fatsG": 60,
  "startsOn": "2025-01-20T00:00:00Z",
  "endsOn": "2025-02-20T00:00:00Z",
  "createdAt": "2025-01-20T09:00:00Z",
  "updatedAt": "2025-01-20T09:00:00Z"
}
```

**Validation:**
- At least one macro value required
- `calories`: 500-10000
- `proteinG`: 0-1000
- `carbsG`: 0-2000
- `fatsG`: 0-500
- `startsOn` optional (defaults to now)
- `endsOn` optional (null = indefinite)

### Get Current Macro Target

```
GET /nutrition/targets/current
```

Fetches the user's currently active macro target.

**Response:** `200 OK` (same structure as create response)

**Logic:**
- Returns target where `startsOn <= now` AND (`endsOn` is null OR `endsOn >= now`)
- Sorted by `startsOn` descending (most recent first)
- Returns 404 if no active target found

### Get Macro Targets History

```
GET /nutrition/targets
```

Retrieves all user's macro targets (past and present).

**Response:** `200 OK`

```json
[
  {
    "id": "uuid",
    "userId": "uuid",
    "calories": 2200,
    "proteinG": 180,
    "carbsG": 250,
    "fatsG": 60,
    "startsOn": "2025-01-20T00:00:00Z",
    "endsOn": null,
    "createdAt": "2025-01-20T09:00:00Z",
    "updatedAt": "2025-01-20T09:00:00Z"
  }
]
```

**Sorting:** Results sorted by `startsOn` descending (newest first)

### Update Macro Target

```
PATCH /nutrition/targets/:id
```

Partially updates a macro target.

**Request Body (all fields optional):**

```json
{
  "calories": 2400,
  "proteinG": 200
}
```

**Response:** `200 OK` (updated target)

**Security:** Verifies user owns the target (403 if not)

### Delete Macro Target

```
DELETE /nutrition/targets/:id
```

Soft-deletes a macro target by setting `deletedAt` timestamp.

**Response:** `204 No Content`

**Security:** Verifies user owns the target (403 if not)

**Implementation:** Uses soft-delete pattern for data preservation and audit trail

---

## Grocery Lists Management

### Create Grocery List

```
POST /nutrition/grocery-lists
```

Creates a new grocery list with items.

**Request Body:**

```json
{
  "title": "Weekly Meal Prep",
  "weekOf": "2025-01-20",
  "items": [
    {
      "foodItemId": "uuid",
      "name": "Chicken Breast",
      "quantity": "2 lbs",
      "isChecked": false
    },
    {
      "name": "Paper Towels",
      "quantity": "1 pack",
      "isChecked": false
    }
  ]
}
```

**Response:** `201 Created`

```json
{
  "id": "uuid",
  "userId": "uuid",
  "title": "Weekly Meal Prep",
  "weekOf": "2025-01-20T00:00:00Z",
  "items": [
    {
      "id": "uuid",
      "listId": "uuid",
      "foodItemId": "uuid",
      "foodItem": { /* full food item details */ },
      "name": "Chicken Breast",
      "quantity": "2 lbs",
      "isChecked": false,
      "createdAt": "2025-01-20T09:00:00Z",
      "updatedAt": "2025-01-20T09:00:00Z"
    }
  ],
  "createdAt": "2025-01-20T09:00:00Z",
  "updatedAt": "2025-01-20T09:00:00Z"
}
```

**Validation:**
- `weekOf` required (ISO 8601 date)
- `title` optional (defaults to "Weekly Grocery List", max 200 chars)
- `items` optional (can create empty list)
- Per item: `name` required (max 200 chars), `foodItemId` optional

### Get Grocery Lists

```
GET /nutrition/grocery-lists
```

Retrieves all user's grocery lists.

**Response:** `200 OK`

```json
[
  {
    "id": "uuid",
    "userId": "uuid",
    "title": "Weekly Meal Prep",
    "weekOf": "2025-01-20T00:00:00Z",
    "items": [ /* grocery items */ ],
    "createdAt": "2025-01-20T09:00:00Z",
    "updatedAt": "2025-01-20T09:00:00Z"
  }
]
```

**Sorting:** Results sorted by `weekOf` descending (newest first)

### Get Single Grocery List

```
GET /nutrition/grocery-lists/:id
```

Fetches a single grocery list by ID with all items.

**Response:** `200 OK` (same structure as create response)

**Security:** Verifies user owns the list (403 if not)

### Update Grocery List

```
PATCH /nutrition/grocery-lists/:id
```

Partially updates a grocery list.

**Request Body (all fields optional):**

```json
{
  "title": "Updated Meal Prep List",
  "items": [
    {
      "foodItemId": "uuid",
      "name": "Chicken Breast",
      "quantity": "3 lbs",
      "isChecked": true
    }
  ]
}
```

**Response:** `200 OK` (updated list with all items)

**Note:** Updating items replaces all existing items (delete + recreate pattern)

**Use Cases:**
- Rename list
- Add/remove items
- Check off items as purchased
- Adjust quantities

### Delete Grocery List

```
DELETE /nutrition/grocery-lists/:id
```

Soft-deletes a grocery list by setting `deletedAt` timestamp.

**Response:** `204 No Content`

**Security:** Verifies user owns the list (403 if not)

**Implementation:** Uses soft-delete pattern - items remain in database for data integrity

---

## Data Transfer Objects (DTOs)

### Response DTOs

All response DTOs use `class-transformer` decorators for runtime type safety:

#### FoodItemResponseDto
- Uses `@Expose()` to explicitly control serialization
- `@Transform()` decorators handle Prisma Decimal → number conversion
- Prevents accidental exposure of internal fields

#### MacroTargetResponseDto
- Handles nullable Decimal fields with conditional transformation
- Converts `Decimal | null` to `number | null` safely

#### GroceryListResponseDto & GroceryItemResponseDto
- Nested transformation with `@Type(() => FoodItemResponseDto)`
- Properly handles optional `foodItem` relations

### Type Utilities (`types/prisma-to-dto.types.ts`)

**Type Guards:**
- `isDecimal(value)`: Runtime check for Prisma Decimal type
- `decimalToNumber(value)`: Safe Decimal → number conversion

**Prisma Types:**
- `PrismaFoodItem`: Type alias for FoodItem entity
- `PrismaMacroTarget`: Type alias for MacroTarget entity
- `PrismaGroceryList`: Extended type with included relations (items + foodItem)
- `FoodItemWithRelations`: FoodItem with optional groceryItems array
- `GroceryListWithRelations`: GroceryList with nested items and foodItems

### Input DTOs

### CreateFoodItemDto

**Required:**
- `name`: Food name (max 200 chars)
- `calories`: Calories per serving (0-10000)
- `proteinG`: Protein in grams (0-500)
- `carbsG`: Carbs in grams (0-500)
- `fatsG`: Fats in grams (0-500)

**Optional:**
- `brand`: Brand name (max 100 chars)
- `servingG`: Serving size in grams (1-5000)
- `tags`: Array of tags for categorization

### CreateMealLogDto

**Required:**
- `mealType`: Type of meal (max 50 chars)
- `foods`: Array of CreateMealEntryDto (at least one)

**Optional:**
- `loggedAt`: When meal was consumed (ISO 8601)
- `notes`: Free-form notes (max 500 chars)

### CreateMealEntryDto

**Required:**
- `foodItemId`: Reference to FoodItem (UUID)
- `servings`: Portion multiplier (0.1-50)

**Optional:**
- `servingG`: Override serving size in grams (1-5000)

### CreateMacroTargetDto

**Optional (at least one required):**
- `calories`: Target calories (500-10000)
- `proteinG`: Target protein (0-1000)
- `carbsG`: Target carbs (0-2000)
- `fatsG`: Target fats (0-500)
- `startsOn`: Start date (ISO 8601)
- `endsOn`: End date (ISO 8601)

### CreateGroceryListDto

**Required:**
- `weekOf`: Week date (ISO 8601)

**Optional:**
- `title`: List title (max 200 chars)
- `items`: Array of CreateGroceryItemDto

### CreateGroceryItemDto

**Required:**
- `name`: Item name (max 200 chars)

**Optional:**
- `foodItemId`: Reference to FoodItem (UUID)
- `quantity`: Quantity/amount (max 100 chars)
- `isChecked`: Checked off status (boolean)

---

## Business Logic

### Service Methods

#### Food Items

- `createFoodItem(userId, dto)`: Creates food with validation
- `getFoodItems(search?, tags?)`: Retrieves foods with filtering
- `getFoodItem(id)`: Gets single food item
- `updateFoodItem(id, dto)`: Updates food item
- `deleteFoodItem(id)`: Deletes food item

#### Meal Logs (Pending Implementation)

- `createMealLog(userId, dto)`: Creates meal with atomic food entries
- `getUserMealLogs(userId, query)`: Retrieves paginated meal history
- `getMealLog(id, userId)`: Gets single meal with ownership check
- `updateMealLog(id, userId, dto)`: Updates meal with ownership check
- `deleteMealLog(id, userId)`: Deletes meal with ownership check

#### Macro Targets

- `createMacroTarget(userId, dto)`: Creates macro target
- `getCurrentMacroTarget(userId)`: Gets active macro target
- `getUserMacroTargets(userId)`: Gets all macro targets history
- `updateMacroTarget(id, userId, dto)`: Updates with ownership check
- `deleteMacroTarget(id, userId)`: Deletes with ownership check

#### Grocery Lists

- `createGroceryList(userId, dto)`: Creates list with items atomically
- `getUserGroceryLists(userId)`: Gets all user's lists
- `getGroceryList(id, userId)`: Gets single list with ownership check
- `updateGroceryList(id, userId, dto)`: Updates with delete+recreate pattern
- `deleteGroceryList(id, userId)`: Deletes with ownership check

---

## Use Cases

### Creating Custom Food Items

User adds a food not in the database:

```json
POST /nutrition/foods
{
  "name": "Homemade Protein Pancakes",
  "servingG": 200,
  "calories": 350,
  "proteinG": 35,
  "carbsG": 40,
  "fatsG": 8,
  "tags": ["recipe", "breakfast", "high-protein"]
}
```

### Logging Daily Meals

User logs breakfast with multiple foods:

```json
POST /nutrition/meals
{
  "mealType": "breakfast",
  "foods": [
    { "foodItemId": "oatmeal-uuid", "servings": 1 },
    { "foodItemId": "protein-powder-uuid", "servings": 1 },
    { "foodItemId": "banana-uuid", "servings": 1 }
  ]
}
```

### Setting Macro Targets

User sets nutrition goals:

```json
POST /nutrition/targets
{
  "calories": 2200,
  "proteinG": 180,
  "carbsG": 220,
  "fatsG": 60,
  "startsOn": "2025-01-20T00:00:00Z"
}
```

### Creating Weekly Grocery List

User creates shopping list:

```json
POST /nutrition/grocery-lists
{
  "title": "Meal Prep Week 3",
  "weekOf": "2025-01-20",
  "items": [
    { "foodItemId": "chicken-uuid", "name": "Chicken Breast", "quantity": "3 lbs" },
    { "foodItemId": "rice-uuid", "name": "Brown Rice", "quantity": "2 bags" }
  ]
}
```

---

## Integration Points

### AI Module

Uses nutrition data for recommendations:
- Analyzes eating patterns
- Suggests meal adjustments based on goals
- Recommends foods to meet macro targets

### Analytics Module

Queries nutrition logs for tracking:
- Calculates daily/weekly macro totals
- Tracks adherence to targets
- Generates nutrition trends and charts

### Goals Module

Links nutrition to body composition goals:
- Tracks calorie deficit/surplus
- Monitors protein intake for muscle gain
- Adjusts targets based on progress

### Profile Module

Displays nutrition summary:
- "Today: 1850/2200 calories"
- "Protein: 165/180g"
- Current macro targets

---

## Future Enhancements

### Planned Features

1. **Recipe Builder**
   - Create recipes from food items
   - Calculate nutritional totals
   - Share recipes with community

2. **Barcode Scanner**
   - Scan product barcodes
   - Auto-populate food data
   - Integration with food databases

3. **Food Database API Integration**
   - USDA FoodData Central
   - OpenFoodFacts
   - Nutritionix API

4. **Meal Planning**
   - Plan meals for the week
   - Auto-generate grocery lists
   - Suggest meals based on macros

5. **Restaurant Integration**
   - Restaurant menu items
   - Popular chain foods
   - Dining out tracking

6. **Micronutrient Tracking**
   - Vitamins and minerals
   - Fiber tracking
   - Water intake

---

## Database Schema Requirements

### Current Tables

- ✅ **FoodItem**: Food database with nutritional info
- ✅ **MacroTarget**: User's macro/calorie targets
- ✅ **GroceryList**: Shopping lists
- ✅ **GroceryItem**: Items in shopping lists

### Required Tables (To Be Added)

- ❌ **MealLog**: User's meal logs
- ❌ **MealEntry**: Food entries within meals

**Proposed MealLog Schema:**

```prisma
model MealLog {
  id        String      @id @default(uuid())
  userId    String
  mealType  String      // breakfast, lunch, dinner, snack
  loggedAt  DateTime    @default(now())
  notes     String?
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  user      User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  entries   MealEntry[]

  @@index([userId, loggedAt])
}

model MealEntry {
  id         String   @id @default(uuid())
  mealLogId  String
  foodItemId String
  servings   Decimal  @db.Decimal(5, 2)  // Portion multiplier
  servingG   Int?     // Override serving size
  createdAt  DateTime @default(now())
  mealLog    MealLog  @relation(fields: [mealLogId], references: [id], onDelete: Cascade)
  foodItem   FoodItem @relation(fields: [foodItemId], references: [id])

  @@index([mealLogId])
  @@index([foodItemId])
}
```

---

## Security Considerations

### Authentication

All endpoints protected by `JwtAuthGuard` - requires valid JWT token.

### Authorization

Ownership validation ensures users can only:
- View their own meal logs
- Update their own macro targets
- Delete their own grocery lists

### Data Validation

All inputs validated via class-validator decorators:
- Type validation (UUID, integer, string, etc.)
- Range validation (calories 0-10000, servings 0.1-50)
- Length validation (names, notes max length)
- Required fields enforced

### SQL Injection Prevention

Uses Prisma ORM with parameterized queries - prevents SQL injection.

---

## Error Handling

### Common Errors

| Status | Error | Cause |
|--------|-------|-------|
| 400 | Bad Request | Invalid data format or validation failure |
| 401 | Unauthorized | Missing or invalid JWT token |
| 403 | Forbidden | User doesn't own the resource |
| 404 | Not Found | Food item, meal log, or target not found |
| 500 | Internal Server Error | Unexpected server error |

### Error Response Format

```json
{
  "statusCode": 404,
  "message": "Food item uuid not found",
  "error": "Not Found"
}
```

---

## Testing

### Manual Testing

Use tools like Postman or cURL:

```bash
# Create food item
curl -X POST http://localhost:3000/nutrition/foods \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Chicken Breast",
    "calories": 165,
    "proteinG": 31,
    "carbsG": 0,
    "fatsG": 3.6
  }'

# Get food items
curl http://localhost:3000/nutrition/foods?search=chicken \
  -H "Authorization: Bearer $TOKEN"

# Create macro target
curl -X POST http://localhost:3000/nutrition/targets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "calories": 2200,
    "proteinG": 180,
    "carbsG": 220,
    "fatsG": 60
  }'

# Create grocery list
curl -X POST http://localhost:3000/nutrition/grocery-lists \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Weekly Shopping",
    "weekOf": "2025-01-20",
    "items": [
      { "name": "Chicken Breast", "quantity": "2 lbs" }
    ]
  }'
```

---

## Performance Considerations

### Database Queries

- Uses Prisma `include` for efficient eager loading
- Indexed on `userId`, `name`, `weekOf`, `startsOn`
- Search uses case-insensitive matching

### Pagination

- Default limit: 20 items
- Max limit: 100 items (prevents large result sets)
- Skip/take pattern for efficient pagination

### Transaction Usage

Atomic operations ensure data consistency:
- Create: MealLog + Entries created together
- Update: List updates with items together
- No partial states possible

---

## Contributing

When adding features to this module:

1. **DTOs**: Add validation decorators to all new fields
2. **Service**: Add business logic and validation
3. **Controller**: Add endpoint with proper guards
4. **README**: Document new endpoints and use cases
5. **Schema**: Update database schema if needed

---

## Related Documentation

- [Main Application README](../../../README.md)
- [Workout Logging Module](../workout-logging/README.md)
- [Database Schema](../../../prisma/schema.prisma)
- [Authentication Guide](../../common/guards/jwt-auth.guard.ts)
