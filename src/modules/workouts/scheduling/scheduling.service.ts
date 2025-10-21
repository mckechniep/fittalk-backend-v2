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

}
