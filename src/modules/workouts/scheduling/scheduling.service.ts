// scheduling/scheduling.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PlannerService, ScheduledAssignment } from './planner.service';
import { ScheduleWeekDto } from '../dtos/schedule-week.dto';
import {
  ScheduledWorkoutResponseDto,
  ScheduleWeekResponseDto,
  UnscheduledDayDto,
} from '../dtos/schedule-workout-response.dto';
import { plainToInstance } from 'class-transformer';
import { Redis } from 'ioredis';

/**
 * Scheduling Service
 * 
 * Orchestrates workout schedule generation with database persistence.
 * 
 * Responsibilities:
 * - Fetch user's workout plan and availability
 * - Call PlannerService to compute optimal schedule
 * - Persist ScheduledWorkout records to database
 * - Ensure idempotency (safe to regenerate same week)
 * - Use distributed locks to prevent concurrent generation
 * - Validate user permissions and data ownership
 * 
 * Design principles:
 * - Orchestration only: delegates algorithm to PlannerService
 * - Transactional: All DB writes succeed or all fail
 * - Idempotent: Can safely regenerate same week multiple times
 * - Distributed-safe: Redis locks prevent race conditions
 * - Rich responses: Includes both success and failure information
 * 
 * Dependencies:
 * - PrismaService: Database access
 * - PlannerService: Pure scheduling algorithm
 * - Redis: Distributed locking, caching
 * - Logger: Structured logging
 */
@Injectable()
export class SchedulingService {
  private readonly logger = new Logger(SchedulingService.name);

  /**
   * Lock timeout for schedule generation (30 seconds).
   * If generation takes longer, lock expires and allows retry.
   */
  private readonly LOCK_TTL_MS = 30000;

  /**
   * How long to wait for lock acquisition (5 seconds).
   * If another process holds lock, wait briefly then fail.
   */
  private readonly LOCK_WAIT_MS = 5000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly planner: PlannerService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}


/**
   * Generate weekly workout schedule.
   * 
   * Flow:
   * 1. Validate inputs (week start date, plan ownership)
   * 2. Acquire distributed lock (prevent concurrent generation)
   * 3. Fetch user's active plan, workout days, availability
   * 4. Call planner algorithm to compute optimal schedule
   * 5. If regenerate=true, delete existing scheduled workouts for this week
   * 6. Persist new ScheduledWorkout records
   * 7. Release lock
   * 8. Return full schedule with nested details
   * 
   * Idempotency:
   * - Same week + same plan = same result (if regenerate=true)
   * - If regenerate=false, returns existing schedule without recomputation
   * 
   * Concurrency:
   * - Uses Redis lock: lock:schedule:{userId}:{weekKey}
   * - Only one generation per user per week at a time
   * - Prevents duplicate ScheduledWorkout creation
   * 
   * @param userId - Authenticated user ID from JWT
   * @param dto - Week to schedule and options
   * @returns Full schedule with scheduled and unscheduled workouts
   */

async generateWeekSchedule(
    userId: string
    dto: ScheduleWeekDto,
): Promise<ScheduleWeekResponseDto> {
    //Parse and validate week start date
    const weekStart = this.parseAndValidateWeekStart(dto.weekStart)
    const weekKey = this.generateWeekKey(weekStart)
this.logger.log(
    `Generate schedule for user ${userId}, week ${weekKey}, regenerate=${dto.regenerate}`,
)}
// Acquire distributed lock to prevent concurrent generation
    const lockKey = `lock:schedule:${userId}:${weekKey}`;
    const lockValue = `${Date.now()}`; // Unique value for this lock holder
    const lockAcquired = await this.acquireLock(lockKey, lockValue);

    if (!lockAcquired) {
      throw new BadRequestException(
        'Schedule generation already in progress for this week. Please try again in a moment.',
      );
    }
}
