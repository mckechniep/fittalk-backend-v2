// workout-logging.controller.ts
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
    ParseUUIDPipe,
} from '@nestjs/common';
import { WorkoutLoggingService } from './workout-logging.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateWorkoutLogDto } from './dtos/create-workout-logging.dto';
import { UpdateWorkoutLogDto } from './dtos/update-workout-logging.dto';
import {
    WorkoutLogResponseDto,
    WorkoutLogHistoryResponseDto,
    GetWorkoutLogsQueryDto,
} from './dtos/workout-logging-response.dto';

/**
 * Workout Logging Controller
 *
 * Handles workout logging and performance tracking.
 * All routes require JWT authentication.
 *
 * Responsibilities:
 * - Log completed workouts with sets and performance data
 * - Update workout logs (correct mistakes, add missed sets)
 * - Fetch workout history with filtering and pagination
 * - Delete workout logs
 * - Support both programmed (following plan) and ad-hoc workouts
 *
 * Design decisions:
 * - RESTful: Standard HTTP methods (POST, GET, PATCH, DELETE)
 * - Resource-oriented: /workout-logging as base path
 * - Atomic operations: Log + sets created/updated together
 * - Rich filtering: By exercise, plan, date range
 * - Pagination: Prevents loading thousands of logs
 * - Validation: DTOs ensure data quality
 *
 * Integration points:
 * - Triggered during/after live workout session (real-time logging)
 * - Triggered after workout completion (batch logging)
 * - Queried by analytics for progress tracking
 * - Queried by AI for plan adjustments based on performance
 * - Used to calculate personal records (PRs)
 *
 * Security:
 * - All routes protected by JwtAuthGuard
 * - User can only access/modify their own logs
 * - Plan/day/item references validated for ownership
 */
@Controller('workout-logging')
@UseGuards(JwtAuthGuard)
export class WorkoutLoggingController {
    constructor(private readonly workoutLoggingService: WorkoutLoggingService) { }

    /**
     * POST /workout-logging
     *
     * Create a workout log with sets.
     *
     * Request body:
     * {
     *   "exerciseId": "uuid",
     *   "planId": "uuid",        // Optional
     *   "dayId": "uuid",         // Optional
     *   "itemId": "uuid",        // Optional
     *   "performedAt": "2025-01-20T09:00:00Z",  // Optional, defaults to now()
     *   "durationMin": 15,       // Optional
     *   "notes": "Felt strong",  // Optional
     *   "sets": [
     *     {
     *       "reps": 10,
     *       "weightKg": 70,
     *       "rir": 3,
     *       "completed": true
     *     }
     *   ]
     * }
     *
     * Validation:
     * - exerciseId must exist in Exercise table
     * - planId/dayId/itemId validated if provided (ownership, relationships)
     * - Sets array must have at least one set
     * - Reps, weight, RIR validated within reasonable ranges
     *
     * Transaction:
     * - Creates WorkoutLog + all WorkoutSets atomically
     * - SetNumbers assigned sequentially (1, 2, 3, ...) based on array order
     *
     * Use cases:
     * - Real-time logging: User completes set, mobile logs immediately
     * - Batch logging: User finishes workout, logs all sets at once
     * - Manual entry: User logs yesterday's workout retroactively
     * - Ad-hoc workout: User does exercise not in program
     * - Programmed workout: User follows plan, logs with plan context
     *
     * Response:
     * Returns created log with:
     * - All sets with assigned setNumbers
     * - Nested exercise details (name, instructions, media)
     * - Timestamps (performedAt, createdAt)
     *
     * Status: 201 Created
     *
     * Example response:
     * {
     *   "id": "uuid",
     *   "exerciseId": "uuid",
     *   "exercise": {
     *     "name": "Barbell Back Squat",
     *     "primaryGroup": "legs",
     *     "equipment": "barbell"
     *   },
     *   "sets": [
     *     { "setNumber": 1, "reps": 10, "weightKg": 70, "rir": 3 },
     *     { "setNumber": 2, "reps": 8, "weightKg": 75, "rir": 2 }
     *   ],
     *   "performedAt": "2025-01-20T09:00:00Z"
     * }
     */
    @Post()
    @HttpCode(HttpStatus.CREATED)
    async createWorkoutLog(
        @CurrentUser('id') userId: string,
        @Body() dto: CreateWorkoutLogDto,
    ): Promise<WorkoutLogResponseDto> {
        return this.workoutLoggingService.createWorkoutLog(userId, dto);
    }

    /**
     * GET /workout-logging/:id
     *
     * Fetch single workout log by ID.
     *
     * Security: Verifies user owns the log
     *
     * Response includes:
     * - All sets ordered by setNumber
     * - Exercise details (name, instructions, media)
     * - Plan/day/item context (if logged as part of program)
     * - Notes and timestamps
     *
     * Use cases:
     * - View workout details: "What did I do on Jan 20?"
     * - Review performance: "How much did I lift last time?"
     * - Compare to prescription: "Did I follow the program?"
     *
     * Throws:
     * - 404 if log not found
     * - 403 if user doesn't own the log
     *
     * Example:
     * GET /workout-logging/uuid-123
     */
    @Get(':id')
    async getWorkoutLog(
        @CurrentUser('id') userId: string,
        @Param('id', ParseUUIDPipe) logId: string,
    ): Promise<WorkoutLogResponseDto> {
        return this.workoutLoggingService.getWorkoutLog(logId, userId);
    }

    /**
     * GET /workout-logging
     *
     * Get user's workout logs with filtering and pagination.
     *
     * Query parameters:
     * - exerciseId: Filter by specific exercise (e.g., all bench press logs)
     * - planId: Filter by workout plan (e.g., logs from current program)
     * - startDate: Show logs on or after this date (ISO 8601)
     * - endDate: Show logs before this date (ISO 8601)
     * - page: Page number (1-indexed, default: 1)
     * - limit: Items per page (default: 20, max: 100)
     *
     * Results sorted by performedAt descending (newest first).
     *
     * Use cases:
     * - Workout history: "Show all my workouts from last month"
     * - Exercise history: "Show all my squat sessions"
     * - Program tracking: "Show logs from my current plan"
     * - Progress analysis: "What weights did I use in January?"
     * - Calendar view: "What workouts did I do this week?"
     *
     * Response includes:
     * - Array of logs with nested sets and exercise details
     * - Pagination metadata (page, limit, total, totalPages)
     *
     * Example queries:
     * GET /workout-logging?exerciseId=uuid&limit=10
     * GET /workout-logging?startDate=2025-01-01&endDate=2025-01-31
     * GET /workout-logging?planId=uuid&page=2
     *
     * Response structure:
     * {
     *   "logs": [...],
     *   "pagination": {
     *     "page": 1,
     *     "limit": 20,
     *     "total": 156,
     *     "totalPages": 8
     *   }
     * }
     */
    @Get()
    async getUserWorkoutLogs(
        @CurrentUser('id') userId: string,
        @Query() query: GetWorkoutLogsQueryDto,
    ): Promise<WorkoutLogHistoryResponseDto> {
        return this.workoutLoggingService.getUserWorkoutLogs(userId, query);
    }

    /**
     * PATCH /workout-logging/:id
     *
     * Update workout log (partial update).
     *
     * Request body (all fields optional):
     * {
     *   "durationMin": 65,           // Updated duration
     *   "notes": "Lower back tight", // Updated notes
     *   "sets": [
     *     {
     *       "setNumber": 2,          // Which set to update
     *       "weightKg": 80,          // Corrected weight
     *       "rir": 2                 // Updated RIR
     *     }
     *   ]
     * }
     *
     * Upsert pattern for sets:
     * - If setNumber exists: UPDATE that set
     * - If setNumber doesn't exist: CREATE new set (add missed set)
     * - Omitted sets remain unchanged
     *
     * Cannot update:
     * - exerciseId (that would be a different workout)
     * - planId/dayId/itemId (contextual, set at creation)
     * - performedAt (when it happened, immutable)
     *
     * Use cases:
     * - Fix mistake: "I meant 80kg, not 8kg on set 2"
     * - Add notes: "Felt lower back tightness during last set"
     * - Add missed set: "Forgot to log my final drop set"
     * - Mark incomplete: "Failed mid-set, mark set 3 as incomplete"
     * - Update duration: "Actual time was 65 min"
     *
     * Transaction: Log and set updates atomic
     *
     * Returns: Updated log with all sets
     *
     * Throws:
     * - 404 if log not found
     * - 403 if user doesn't own the log
     * - 400 if setNumber invalid
     */
    @Patch(':id')
    async updateWorkoutLog(
        @CurrentUser('id') userId: string,
        @Param('id', ParseUUIDPipe) logId: string,
        @Body() dto: UpdateWorkoutLogDto,
    ): Promise<WorkoutLogResponseDto> {
        return this.workoutLoggingService.updateWorkoutLog(logId, userId, dto);
    }

    /**
     * DELETE /workout-logging/:id
     *
     * Delete a workout log.
     *
     * Security: Verifies user owns the log
     *
     * Cascade: Associated WorkoutSets deleted automatically (DB CASCADE)
     *
     * Use cases:
     * - Accidental log: "I didn't do that workout, delete it"
     * - Duplicate: "I logged this twice by mistake"
     * - Test data: "Remove test logs"
     *
     * Warning: This is permanent deletion.
     * Consider soft-delete for production (add deletedAt field).
     *
     * Returns: 204 No Content
     *
     * Throws:
     * - 404 if log not found
     * - 403 if user doesn't own the log
     *
     * Example:
     * DELETE /workout-logging/uuid-123
     * → 204 No Content
     */
    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async deleteWorkoutLog(
        @CurrentUser('id') userId: string,
        @Param('id', ParseUUIDPipe) logId: string,
    ): Promise<void> {
        return this.workoutLoggingService.deleteWorkoutLog(logId, userId);
    }
}
