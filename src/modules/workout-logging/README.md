# Workout Logging Module

The Workout Logging Module handles all functionality related to logging completed workouts, tracking performance data, and maintaining workout history.

## Overview

This module encapsulates workout logging and performance tracking functionality, allowing users to:
- Log completed workouts with sets and performance data
- Track actual performance vs prescribed workouts (adherence tracking)
- View workout history with filtering and pagination
- Support both programmed (following a plan) and ad-hoc workouts
- Calculate derived metrics (volume, e1RM, trends)

## Architecture

### Module Structure

```
src/modules/workout-logging/
├── workout-logging.module.ts       # Module definition
├── workout-logging.controller.ts   # REST API endpoints
├── workout-logging.service.ts      # Business logic
├── dtos/
│   ├── create-workout-logging.dto.ts
│   ├── update-workout-logging.dto.ts
│   └── workout-logging-response.dto.ts
└── README.md
```

### Dependencies

- **PrismaModule**: Database access (global)
- No other module dependencies

### Exported Services

The module exports `WorkoutLoggingService` for use by:
- **AI Module**: Analyzes workout history for plan adjustments
- **Analytics Module**: Calculates progress metrics and trends
- **Live Session Module**: Converts live sessions to workout logs on completion
- **Profile Module**: Displays recent workout activity

## API Endpoints

All endpoints require JWT authentication via `JwtAuthGuard`.

### Create Workout Log

```
POST /workout-logging
```

Creates a new workout log with sets. Supports both programmed workouts (with plan context) and ad-hoc workouts.

**Request Body:**

```json
{
  "exerciseId": "uuid",              // Required
  "planId": "uuid",                  // Optional - for programmed workouts
  "dayId": "uuid",                   // Optional - specific day in plan
  "itemId": "uuid",                  // Optional - specific programmed item
  "performedAt": "2025-01-20T09:00:00Z",  // Optional - defaults to now()
  "durationMin": 60,                 // Optional - total duration
  "notes": "Felt strong today",      // Optional - free-form notes
  "sets": [
    {
      "reps": 10,                    // Optional - null for time-based
      "weightKg": 70,                // Optional - null for bodyweight
      "rir": 3,                      // Optional - Reps In Reserve (0-10)
      "completed": true              // Optional - defaults to true
    }
  ]
}
```

**Response:** `201 Created`

```json
{
  "id": "uuid",
  "userId": "uuid",
  "exerciseId": "uuid",
  "exercise": {
    "id": "uuid",
    "slug": "barbell-back-squat",
    "name": "Barbell Back Squat",
    "primaryGroup": "legs",
    "equipment": "barbell",
    "instructions": "...",
    "media": null
  },
  "planId": "uuid",
  "dayId": "uuid",
  "itemId": "uuid",
  "performedAt": "2025-01-20T09:00:00Z",
  "durationMin": 60,
  "notes": "Felt strong today",
  "sets": [
    {
      "id": "uuid",
      "logId": "uuid",
      "setNumber": 1,
      "reps": 10,
      "weightKg": 70,
      "rir": 3,
      "completed": true,
      "createdAt": "2025-01-20T09:05:00Z"
    }
  ],
  "createdAt": "2025-01-20T09:05:00Z"
}
```

**Validation:**
- `exerciseId` must exist in Exercise table
- `planId`/`dayId`/`itemId` validated for ownership and relationships if provided
- Sets array must have at least one set
- Reps: 0-100, Weight: 0-500kg, RIR: 0-10, Duration: 1-300 minutes

**Transaction:** Creates WorkoutLog + all WorkoutSets atomically

### Get Single Workout Log

```
GET /workout-logging/:id
```

Fetches a single workout log by ID with all sets and exercise details.

**Response:** `200 OK` (same structure as create response)

**Security:** Verifies user owns the log (403 if not)

### Get Workout Logs (History)

```
GET /workout-logging
```

Retrieves user's workout logs with filtering and pagination.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `exerciseId` | UUID | Filter by specific exercise |
| `planId` | UUID | Filter by workout plan |
| `startDate` | ISO 8601 | Show logs on or after this date |
| `endDate` | ISO 8601 | Show logs before this date |
| `page` | Integer | Page number (default: 1) |
| `limit` | Integer | Items per page (default: 20, max: 100) |

**Example Queries:**

```
GET /workout-logging?exerciseId=uuid&limit=10
GET /workout-logging?startDate=2025-01-01&endDate=2025-01-31
GET /workout-logging?planId=uuid&page=2
```

**Response:** `200 OK`

```json
{
  "logs": [
    { /* WorkoutLogResponseDto */ }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 156,
    "totalPages": 8
  }
}
```

**Sorting:** Results sorted by `performedAt` descending (newest first)

### Update Workout Log

```
PATCH /workout-logging/:id
```

Partially updates a workout log. Supports updating duration, notes, and sets.

**Request Body (all fields optional):**

```json
{
  "durationMin": 65,              // Updated duration
  "notes": "Lower back tight",    // Updated notes
  "sets": [
    {
      "setNumber": 2,             // Which set to update (required)
      "weightKg": 80,             // Updated weight
      "rir": 2                    // Updated RIR
    }
  ]
}
```

**Upsert Pattern for Sets:**
- If `setNumber` exists: **UPDATE** that set
- If `setNumber` doesn't exist: **CREATE** new set
- Omitted sets remain unchanged

**Cannot Update:**
- `exerciseId` (that would be a different workout)
- `planId`/`dayId`/`itemId` (contextual, set at creation)
- `performedAt` (immutable timestamp)

**Response:** `200 OK` (updated log with all sets)

**Use Cases:**
- Fix mistakes: "I meant 80kg, not 8kg on set 2"
- Add notes: "Felt lower back tightness during last set"
- Add missed sets: "Forgot to log my final drop set"
- Mark incomplete: "Failed mid-set, mark as incomplete"

### Delete Workout Log

```
DELETE /workout-logging/:id
```

Deletes a workout log and all associated sets (cascade).

**Response:** `204 No Content`

**Security:** Verifies user owns the log (403 if not)

**Warning:** This is permanent deletion. Consider soft-delete for production.

## Data Transfer Objects (DTOs)

### CreateWorkoutLogDto

Used for creating new workout logs.

**Required Fields:**
- `exerciseId` (UUID): Exercise performed

**Optional Fields:**
- `planId` (UUID): Workout plan reference
- `dayId` (UUID): Specific day in plan
- `itemId` (UUID): Specific programmed exercise item
- `performedAt` (ISO 8601): When performed (defaults to now)
- `durationMin` (1-300): Total duration in minutes
- `notes` (max 1000 chars): Free-form notes
- `sets` (array): Array of CreateWorkoutSetDto (at least one required)

### CreateWorkoutSetDto

Nested within CreateWorkoutLogDto to represent individual sets.

**All fields optional:**
- `reps` (0-100): Reps completed
- `weightKg` (0-500): Weight used in kg
- `rir` (0-10): Reps In Reserve
- `completed` (boolean): Whether set was completed (default: true)

### UpdateWorkoutLogDto

Used for updating existing workout logs (partial updates).

**All fields optional:**
- `durationMin` (1-300): Updated duration
- `notes` (max 1000 chars): Updated notes
- `sets` (array): Array of UpdateWorkoutSetDto for upsert

### UpdateWorkoutSetDto

Nested within UpdateWorkoutLogDto for updating sets.

**Required:**
- `setNumber` (1-50): Which set to update/create

**Optional:**
- `reps` (0-100): Updated reps
- `weightKg` (0-500): Updated weight
- `rir` (0-10): Updated RIR
- `completed` (boolean): Updated completion status

### WorkoutLogResponseDto

Response DTO with all workout log details.

**Structure:**
- `id`, `userId`, `exerciseId`: Identifiers
- `planId`, `dayId`, `itemId`: Optional plan context
- `exercise`: Nested ExerciseSummaryDto
- `performedAt`: When performed (UTC)
- `durationMin`: Duration in minutes (nullable)
- `notes`: User notes (nullable)
- `sets`: Array of WorkoutSetResponseDto (ordered by setNumber)
- `createdAt`: Record creation timestamp

### GetWorkoutLogsQueryDto

Query parameters for filtering workout logs.

**All fields optional:**
- `exerciseId` (UUID): Filter by exercise
- `planId` (UUID): Filter by plan
- `startDate` (ISO 8601): Start date range
- `endDate` (ISO 8601): End date range
- `page` (min: 1): Page number
- `limit` (min: 1, max: 100): Items per page

## Business Logic

### Service Methods

#### `createWorkoutLog(userId, dto)`

Creates a workout log with sets atomically.

**Flow:**
1. Validate exercise exists
2. Validate optional plan/day/item references
3. Create WorkoutLog record
4. Create all WorkoutSet records (setNumber assigned sequentially)
5. Return complete log with nested sets and exercise

**Transaction:** Ensures log + sets created together or not at all

#### `getWorkoutLog(logId, userId)`

Fetches a single workout log with ownership verification.

**Security:** Returns 403 if user doesn't own the log

#### `getUserWorkoutLogs(userId, query)`

Retrieves paginated workout history with filtering.

**Features:**
- Supports multiple filter combinations
- Date range filtering
- Pagination with metadata
- Sorted by performedAt descending (newest first)

#### `updateWorkoutLog(logId, userId, dto)`

Updates workout log with upsert pattern for sets.

**Flow:**
1. Verify log exists and ownership
2. Update log fields (duration, notes) if provided
3. Upsert sets if provided (update existing, create new)
4. Return updated log

**Transaction:** Ensures atomicity of updates

#### `deleteWorkoutLog(logId, userId)`

Deletes workout log with ownership verification.

**Cascade:** Associated WorkoutSets deleted automatically via DB CASCADE

### Validation

#### Plan References Validation

When `planId`, `dayId`, or `itemId` are provided:
- Validates plan exists and user owns it
- Validates day belongs to the plan (if both provided)
- Validates item belongs to the day (if both provided)

**Throws:**
- `NotFoundException`: Reference not found
- `ForbiddenException`: User doesn't own the reference
- `BadRequestException`: References don't match (e.g., day doesn't belong to plan)

#### Set Upsert Strategy

When updating sets:
- Match by `setNumber` within the log
- If exists: Update with provided fields
- If not exists: Create new set with that setNumber
- Omitted fields remain unchanged (partial update)

## Use Cases

### Programmed Workout Logging

User follows their workout plan and logs exercises with context:

```json
{
  "exerciseId": "squat-exercise-uuid",
  "planId": "current-plan-uuid",
  "dayId": "leg-day-uuid",
  "itemId": "squat-item-uuid",
  "sets": [
    { "reps": 10, "weightKg": 100, "rir": 2 },
    { "reps": 8, "weightKg": 105, "rir": 1 },
    { "reps": 6, "weightKg": 110, "rir": 0 }
  ]
}
```

### Ad-Hoc Workout Logging

User does exercises not in their program:

```json
{
  "exerciseId": "pull-up-uuid",
  "notes": "Extra pull-ups after workout",
  "sets": [
    { "reps": 12 },
    { "reps": 10 },
    { "reps": 8 }
  ]
}
```

### Retroactive Logging

User logs yesterday's workout:

```json
{
  "exerciseId": "bench-press-uuid",
  "performedAt": "2025-01-19T10:00:00Z",
  "sets": [
    { "reps": 10, "weightKg": 80, "rir": 3 }
  ]
}
```

### Correcting Mistakes

User fixes incorrect weight entry:

```
PATCH /workout-logging/:logId
{
  "sets": [
    { "setNumber": 2, "weightKg": 80 }  // Was 8, meant 80
  ]
}
```

### Adding Missed Sets

User forgot to log a final set:

```
PATCH /workout-logging/:logId
{
  "sets": [
    { "setNumber": 4, "reps": 8, "weightKg": 70, "rir": 4 }
  ]
}
```

## Integration Points

### AI Module

Uses workout history for plan personalization:
- Analyzes performance trends
- Adjusts program difficulty based on RIR patterns
- Recommends deload weeks based on fatigue indicators

### Analytics Module

Queries logs for progress tracking:
- Calculates total volume (sets × reps × weight)
- Tracks e1RM progression over time
- Generates progress charts and trends

### Live Session Module

Converts active workout sessions to logs:
- Real-time logging as user completes sets
- Batch logging on session completion
- Pre-fills plan context from active session

### Profile Module

Displays recent activity:
- "Last workout: Bench Press, 3 days ago"
- Weekly workout count
- Current streak tracking

## Future Enhancements

### Planned Features

1. **Analytics Service**
   - Computed metrics (volume, e1RM trends)
   - Progressive overload tracking
   - Fatigue monitoring

2. **Personal Records Tracking**
   - Automatic PR detection
   - PR history and milestones
   - Celebrations and notifications

3. **Workout Templates**
   - Create templates from successful logs
   - Share templates with community
   - Template recommendations

4. **Social Sharing**
   - Optional workout log sharing
   - Community feed
   - Privacy controls

5. **Soft Delete**
   - Add `deletedAt` field for recovery
   - Archive instead of permanent delete
   - Admin recovery tools

## Security Considerations

### Authentication

All endpoints protected by `JwtAuthGuard` - requires valid JWT token.

### Authorization

Ownership validation ensures users can only:
- View their own workout logs
- Update their own workout logs
- Delete their own workout logs

Plan/day/item references validated for ownership.

### Data Validation

All inputs validated via class-validator decorators:
- Type validation (UUID, integer, string, etc.)
- Range validation (reps 0-100, weight 0-500kg)
- Length validation (notes max 1000 chars)
- Required fields enforced

### SQL Injection Prevention

Uses Prisma ORM with parameterized queries - prevents SQL injection.

## Testing

### Test Script

The module includes endpoint testing:

```bash
./test/test-all-endpoints.sh
```

### Manual Testing

Use the provided test script or tools like Postman/cURL:

```bash
# Create workout log
curl -X POST http://localhost:3000/workout-logging \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "exerciseId": "uuid",
    "sets": [{"reps": 10, "weightKg": 100, "rir": 2}]
  }'

# Get workout history
curl http://localhost:3000/workout-logging?limit=10 \
  -H "Authorization: Bearer $TOKEN"

# Update workout log
curl -X PATCH http://localhost:3000/workout-logging/:id \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notes": "Updated notes"}'

# Delete workout log
curl -X DELETE http://localhost:3000/workout-logging/:id \
  -H "Authorization: Bearer $TOKEN"
```

## Database Schema

### WorkoutLog Table

- `id` (UUID, PK)
- `userId` (UUID, FK → User)
- `exerciseId` (UUID, FK → Exercise)
- `planId` (UUID, FK → WorkoutPlan, nullable)
- `dayId` (UUID, FK → WorkoutDay, nullable)
- `itemId` (UUID, FK → WorkoutItem, nullable)
- `performedAt` (DateTime)
- `durationMin` (Integer, nullable)
- `notes` (Text, nullable)
- `createdAt` (DateTime)

### WorkoutSet Table

- `id` (UUID, PK)
- `logId` (UUID, FK → WorkoutLog, CASCADE)
- `setNumber` (Integer)
- `reps` (Integer, nullable)
- `weightKg` (Decimal, nullable)
- `rir` (Integer, nullable)
- `completed` (Boolean)
- `createdAt` (DateTime)

**Unique Constraint:** `(logId, setNumber)` - prevents duplicate set numbers

## Error Handling

### Common Errors

| Status | Error | Cause |
|--------|-------|-------|
| 400 | Bad Request | Invalid data format or validation failure |
| 401 | Unauthorized | Missing or invalid JWT token |
| 403 | Forbidden | User doesn't own the resource |
| 404 | Not Found | Workout log, exercise, or plan not found |
| 500 | Internal Server Error | Unexpected server error |

### Error Response Format

```json
{
  "statusCode": 404,
  "message": "Workout log uuid not found",
  "error": "Not Found"
}
```

## Logging

Structured logging via NestJS Logger:
- Log level: `info`, `warn`, `error`
- Context: `WorkoutLoggingService`
- Logged events: Creation, updates, deletions, ownership violations

**Example logs:**

```
[WorkoutLoggingService] Creating workout log for user uuid, exercise uuid, 3 sets
[WorkoutLoggingService] Successfully created workout log uuid
[WorkoutLoggingService] Updating workout log uuid
[WorkoutLoggingService] User uuid attempted to access log uuid owned by uuid2
[WorkoutLoggingService] Deleted workout log uuid
```

## Performance Considerations

### Database Queries

- Uses Prisma `include` for efficient eager loading
- Parallel queries via `Promise.all` for count + fetch operations
- Indexed on `userId`, `exerciseId`, `planId`, `performedAt`

### Pagination

- Default limit: 20 items
- Max limit: 100 items (prevents large result sets)
- Skip/take pattern for efficient pagination

### Transaction Usage

Atomic operations ensure data consistency:
- Create: Log + Sets created together
- Update: Log fields + Set upserts together
- No partial states possible

## Contributing

When adding features to this module:

1. **DTOs**: Add validation decorators to all new fields
2. **Service**: Add business logic and validation
3. **Controller**: Add endpoint with OpenAPI comments
4. **Tests**: Update test script with new endpoints
5. **README**: Document new endpoints and use cases

## Related Documentation

- [Main Application README](../../../README.md)
- [API Documentation](../../../docs/api.md)
- [Database Schema](../../../docs/schema.md)
- [Authentication Guide](../../../docs/auth.md)
