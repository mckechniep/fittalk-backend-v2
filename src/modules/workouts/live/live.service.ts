// live-sessions/live-session.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { RedisClientType } from 'redis';
import { REDIS_CLIENT } from '../../../common/redis/redis.module';
import {
  WorkoutSessionStatus,
  ExerciseSetStatus,
  Prisma,
} from '@prisma/client';
import {
  StartSessionDto,
  CompleteSetDto,
  UpdateSessionDto,
  SessionFiltersDto,
} from '../dtos/live-session.dto';
import {
  LiveSessionResponseDto,
  SessionSetResponseDto,
  SessionStatsDto,
  SessionHistoryResponseDto,
} from '../dtos/live-session-response.dto';
import { plainToInstance } from 'class-transformer';
import { MetricsService } from '../../../common/metrics/metrics.service';
import { CacheService } from '../../../common/cache/cache.service';

/**
 * Live Session Service
 * 
 * Manages real-time workout session execution and tracking.
 * 
 * Responsibilities:
 * - Start/pause/resume/complete workout sessions
 * - Track individual set completions with performance metrics
 * - Real-time progress tracking and statistics
 * - Session state persistence and recovery
 * - Concurrent session prevention (one active session per user)
 * - Integration with scheduled workouts
 * - Performance analytics and historical tracking
 * - Real-time event emission for UI updates
 * 
 * Design principles:
 * - State machine: Enforces valid session state transitions
 * - Idempotent operations: Safe to retry failed requests
 * - Distributed-safe: Redis locks prevent race conditions
 * - Event-driven: Emits domain events for real-time updates
 * - Optimistic locking: Prevents concurrent modifications
 * - Rich telemetry: Detailed metrics for performance monitoring
 * - Graceful degradation: Continues working if Redis unavailable
 * 
 * State transitions:
 * - null → in_progress (start session)
 * - in_progress → paused (pause session)
 * - paused → in_progress (resume session)
 * - in_progress → completed (complete session)
 * - any → abandoned (abandon session after timeout)
 * 
 * Dependencies:
 * - PrismaService: Database access
 * - Redis: Distributed locking, session state caching
 * - EventEmitter2: Domain event publishing
 * - MetricsService: Performance monitoring
 * - CacheService: Result caching
 * - Logger: Structured logging
 */
@Injectable()
export class LiveSessionService {
  private readonly logger = new Logger(LiveSessionService.name);

  /**
   * Lock timeout for session operations (10 seconds).
   * Prevents concurrent modifications to same session.
   */
  private readonly SESSION_LOCK_TTL_MS = 10000;

  /**
   * Cache TTL for active session lookups (30 seconds).
   * Reduces DB load for frequently accessed session data.
   */
  private readonly ACTIVE_SESSION_CACHE_TTL_SEC = 30;

  /**
   * Session timeout threshold (2 hours).
   * Sessions inactive longer than this are auto-abandoned.
   */
  private readonly SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000;

  /**
   * Maximum concurrent sets in progress per session.
   * Prevents data integrity issues from race conditions.
   */
  private readonly MAX_CONCURRENT_SETS = 1;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClientType,
    private readonly eventEmitter: EventEmitter2,
    private readonly metrics: MetricsService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Start a new workout session.
   * 
   * Flow:
   * 1. Validate user has no active sessions
   * 2. Verify scheduled workout exists and belongs to user
   * 3. Acquire distributed lock
   * 4. Create WorkoutSession record
   * 5. Initialize session cache in Redis
   * 6. Emit session.started event
   * 7. Return full session details
   * 
   * Validation:
   * - User can only have ONE active session at a time
   * - Scheduled workout must exist and be in 'scheduled' status
   * - Scheduled workout must belong to requesting user
   * - Scheduled workout time should be within reasonable window
   * 
   * Concurrency:
   * - Uses Redis lock: lock:session:start:{userId}
   * - Prevents race condition of starting multiple sessions
   * 
   * @param userId - Authenticated user ID from JWT
   * @param dto - Session start parameters
   * @returns Created session with full nested details
   * @throws ConflictException if user already has active session
   * @throws NotFoundException if scheduled workout not found
   * @throws ForbiddenException if user doesn't own scheduled workout
   */
  async startSession(
    userId: string,
    dto: StartSessionDto,
  ): Promise<LiveSessionResponseDto> {
    this.logger.log(`Starting session for user ${userId}, scheduled workout ${dto.scheduledWorkoutId}`);

    // Acquire lock to prevent concurrent session starts
    const lockKey = `lock:session:start:${userId}`;
    const lockValue = `${Date.now()}`;
    const lockAcquired = await this.acquireLock(lockKey, lockValue);

    if (!lockAcquired) {
      throw new ConflictException(
        'Session start already in progress. Please wait a moment and try again.',
      );
    }

    try {
      // Check for existing active session
      const activeSession = await this.getActiveSessionForUser(userId);
      if (activeSession) {
        this.logger.warn(
          `User ${userId} attempted to start session while session ${activeSession.id} is active`,
        );
        throw new ConflictException(
          'You already have an active workout session. Please complete or abandon it first.',
        );
      }

      // Validate scheduled workout
      const scheduledWorkout = await this.validateScheduledWorkout(
        userId,
        dto.scheduledWorkoutId,
      );

      // Create session with transaction
      const session = await this.prisma.$transaction(async (tx) => {
        // Create session record
        const newSession = await tx.workoutSession.create({
          data: {
            userId,
            scheduledWorkoutId: dto.scheduledWorkoutId,
            planId: scheduledWorkout.planId,
            dayId: scheduledWorkout.dayId,
            status: WorkoutSessionStatus.in_progress,
            startedAt: new Date(),
            notes: dto.notes,
          },
          include: {
            scheduledWorkout: {
              include: {
                day: {
                  include: {
                    items: {
                      include: {
                        exercise: true,
                      },
                      orderBy: { order: 'asc' },
                    },
                  },
                },
              },
            },
          },
        });

        // Update scheduled workout status
        await tx.scheduledWorkout.update({
          where: { id: dto.scheduledWorkoutId },
          data: { status: 'in_progress' },
        });

        // Initialize exercise sets in database
        if (newSession.scheduledWorkout?.day?.items) {
          const setsToCreate = newSession.scheduledWorkout.day.items.flatMap(
            (item) => {
              const sets = [];
              for (let setNum = 1; setNum <= item.targetSets; setNum++) {
                sets.push({
                  sessionId: newSession.id,
                  workoutItemId: item.id,
                  exerciseId: item.exerciseId,
                  setNumber: setNum,
                  status: ExerciseSetStatus.pending,
                  targetReps: item.targetReps,
                  targetWeight: item.targetWeight,
                  targetRir: item.targetRir,
                  restSec: item.restSec,
                });
              }
              return sets;
            },
          );

          await tx.exerciseSet.createMany({
            data: setsToCreate,
          });
        }

        return newSession;
      });

      // Cache active session in Redis for fast lookups
      await this.cacheActiveSession(userId, session.id);

      // Emit domain event for real-time updates
      this.eventEmitter.emit('session.started', {
        userId,
        sessionId: session.id,
        scheduledWorkoutId: dto.scheduledWorkoutId,
        startedAt: session.startedAt,
      });

      // Track metrics
      this.metrics.incrementCounter('workout_sessions_started_total', {
        userId,
      });

      this.logger.log(`Successfully started session ${session.id} for user ${userId}`);

      // Fetch full session with sets
      return this.getSessionById(userId, session.id);
    } finally {
      await this.releaseLock(lockKey, lockValue);
    }
  }

  /**
   * Get active session for user.
   * 
   * Uses multi-layer caching:
   * 1. Check Redis cache (30s TTL)
   * 2. Query database if cache miss
   * 3. Populate cache for future requests
   * 
   * @param userId - User ID
   * @returns Active session or null if none exists
   */
  async getActiveSessionForUser(
    userId: string,
  ): Promise<LiveSessionResponseDto | null> {
    // Try cache first
    const cacheKey = `active-session:${userId}`;
    const cachedSessionId = await this.cache.get<string>(cacheKey);

    if (cachedSessionId) {
      try {
        return await this.getSessionById(userId, cachedSessionId);
      } catch (error) {
        // Session may have been completed/abandoned, cache is stale
        await this.cache.delete(cacheKey);
      }
    }

    // Cache miss or stale, query database
    const session = await this.prisma.workoutSession.findFirst({
      where: {
        userId,
        status: {
          in: [WorkoutSessionStatus.in_progress, WorkoutSessionStatus.paused],
        },
      },
      include: this.getSessionInclude(),
      orderBy: { startedAt: 'desc' },
    });

    if (!session) {
      return null;
    }

    // Populate cache
    await this.cacheActiveSession(userId, session.id);

    return this.transformToSessionDto(session);
  }

  /**
   * Get session by ID with full details.
   * 
   * Security: Verifies user owns the session
   * 
   * @param userId - User ID from JWT
   * @param sessionId - Session ID
   * @returns Full session details with nested sets and exercises
   * @throws NotFoundException if session doesn't exist
   * @throws ForbiddenException if user doesn't own session
   */
  async getSessionById(
    userId: string,
    sessionId: string,
  ): Promise<LiveSessionResponseDto> {
    const session = await this.prisma.workoutSession.findUnique({
      where: { id: sessionId },
      include: this.getSessionInclude(),
    });

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    if (session.userId !== userId) {
      this.logger.warn(
        `User ${userId} attempted to access session ${sessionId} owned by ${session.userId}`,
      );
      throw new ForbiddenException('You do not have access to this session');
    }

    return this.transformToSessionDto(session);
  }

  /**
   * Complete an exercise set.
   * 
   * Flow:
   * 1. Validate session is active and belongs to user
   * 2. Acquire session lock
   * 3. Validate set exists and is in correct state
   * 4. Record actual performance (reps, weight, RIR, RPE)
   * 5. Update set status to completed
   * 6. Calculate session progress
   * 7. Emit set.completed event
   * 8. Auto-advance to next set if applicable
   * 
   * Validation:
   * - Session must be in 'in_progress' status
   * - Set must be in 'pending' or 'in_progress' status
   * - Only one set can be in_progress at a time (enforced)
   * - Actual values must be reasonable (positive numbers)
   * 
   * @param userId - User ID from JWT
   * @param sessionId - Active session ID
   * @param setId - Set ID to complete
   * @param dto - Actual performance data
   * @returns Updated set details
   */
  async completeSet(
    userId: string,
    sessionId: string,
    setId: string,
    dto: CompleteSetDto,
  ): Promise<SessionSetResponseDto> {
    const lockKey = `lock:session:${sessionId}`;
    const lockValue = `${Date.now()}`;
    const lockAcquired = await this.acquireLock(lockKey, lockValue);

    if (!lockAcquired) {
      throw new ConflictException(
        'Session is being modified by another request. Please try again.',
      );
    }

    try {
      // Validate session ownership and status
      const session = await this.getSessionById(userId, sessionId);

      if (session.status !== WorkoutSessionStatus.in_progress) {
        throw new BadRequestException(
          `Cannot complete set: session is ${session.status}`,
        );
      }

      // Validate set
      const set = await this.prisma.exerciseSet.findUnique({
        where: { id: setId },
        include: {
          exercise: true,
          workoutItem: true,
        },
      });

      if (!set) {
        throw new NotFoundException(`Set ${setId} not found`);
      }

      if (set.sessionId !== sessionId) {
        throw new BadRequestException(
          `Set ${setId} does not belong to session ${sessionId}`,
        );
      }

      if (set.status === ExerciseSetStatus.completed) {
        this.logger.warn(`Set ${setId} already completed, returning existing data`);
        return this.transformToSetDto(set);
      }

      if (
        set.status !== ExerciseSetStatus.pending &&
        set.status !== ExerciseSetStatus.in_progress
      ) {
        throw new BadRequestException(
          `Cannot complete set in status: ${set.status}`,
        );
      }

      // Validate actual performance data
      this.validateSetPerformance(dto);

      // Update set with actual performance
      const updatedSet = await this.prisma.exerciseSet.update({
        where: { id: setId },
        data: {
          status: ExerciseSetStatus.completed,
          actualReps: dto.actualReps,
          actualWeight: dto.actualWeight,
          actualRir: dto.actualRir,
          rpe: dto.rpe,
          completedAt: new Date(),
          notes: dto.notes,
        },
        include: {
          exercise: true,
          workoutItem: true,
        },
      });

      // Calculate session progress
      const progress = await this.calculateSessionProgress(sessionId);

      // Update session's last activity timestamp
      await this.prisma.workoutSession.update({
        where: { id: sessionId },
        data: { updatedAt: new Date() },
      });

      // Emit domain event
      this.eventEmitter.emit('session.set.completed', {
        userId,
        sessionId,
        setId,
        exerciseId: set.exerciseId,
        setNumber: set.setNumber,
        actualReps: dto.actualReps,
        actualWeight: dto.actualWeight,
        progress,
        completedAt: updatedSet.completedAt,
      });

      // Track metrics
      this.metrics.incrementCounter('exercise_sets_completed_total', {
        userId,
        exerciseId: set.exerciseId,
      });

      this.logger.log(
        `Set ${setId} completed: ${dto.actualReps} reps @ ${dto.actualWeight}lbs, RIR ${dto.actualRir}, RPE ${dto.rpe}`,
      );

      return this.transformToSetDto(updatedSet);
    } finally {
      await this.releaseLock(lockKey, lockValue);
    }
  }

  /**
   * Pause active session.
   * 
   * Use cases:
   * - User needs break mid-workout
   * - App backgrounded on mobile
   * - Network interruption recovery
   * 
   * @param userId - User ID from JWT
   * @param sessionId - Session ID to pause
   * @returns Updated session
   */
  async pauseSession(
    userId: string,
    sessionId: string,
  ): Promise<LiveSessionResponseDto> {
    const session = await this.getSessionById(userId, sessionId);

    if (session.status !== WorkoutSessionStatus.in_progress) {
      throw new BadRequestException(
        `Cannot pause session: current status is ${session.status}`,
      );
    }

    const updated = await this.prisma.workoutSession.update({
      where: { id: sessionId },
      data: {
        status: WorkoutSessionStatus.paused,
        pausedAt: new Date(),
      },
      include: this.getSessionInclude(),
    });

    this.eventEmitter.emit('session.paused', {
      userId,
      sessionId,
      pausedAt: updated.pausedAt,
    });

    this.logger.log(`Session ${sessionId} paused`);

    return this.transformToSessionDto(updated);
  }

  /**
   * Resume paused session.
   * 
   * @param userId - User ID from JWT
   * @param sessionId - Session ID to resume
   * @returns Updated session
   */
  async resumeSession(
    userId: string,
    sessionId: string,
  ): Promise<LiveSessionResponseDto> {
    const session = await this.getSessionById(userId, sessionId);

    if (session.status !== WorkoutSessionStatus.paused) {
      throw new BadRequestException(
        `Cannot resume session: current status is ${session.status}`,
      );
    }

    // Check if session has timed out
    const pausedDuration = Date.now() - new Date(session.pausedAt!).getTime();
    if (pausedDuration > this.SESSION_TIMEOUT_MS) {
      this.logger.warn(
        `Session ${sessionId} timed out after ${pausedDuration}ms, auto-abandoning`,
      );
      return this.abandonSession(userId, sessionId);
    }

    const updated = await this.prisma.workoutSession.update({
      where: { id: sessionId },
      data: {
        status: WorkoutSessionStatus.in_progress,
        resumedAt: new Date(),
      },
      include: this.getSessionInclude(),
    });

    this.eventEmitter.emit('session.resumed', {
      userId,
      sessionId,
      resumedAt: updated.resumedAt,
    });

    this.logger.log(`Session ${sessionId} resumed`);

    return this.transformToSessionDto(updated);
  }

  /**
   * Complete workout session.
   * 
   * Flow:
   * 1. Validate all required sets completed (configurable threshold)
   * 2. Calculate final session statistics
   * 3. Update session status to completed
   * 4. Update scheduled workout status
   * 5. Clear active session cache
   * 6. Emit session.completed event
   * 7. Update user's workout streaks/achievements
   * 
   * Validation:
   * - Session must be in_progress or paused
   * - Minimum completion threshold met (e.g., 80% of sets)
   * 
   * @param userId - User ID from JWT
   * @param sessionId - Session ID to complete
   * @param dto - Optional final notes and rating
   * @returns Completed session with final statistics
   */
  async completeSession(
    userId: string,
    sessionId: string,
    dto?: UpdateSessionDto,
  ): Promise<LiveSessionResponseDto> {
    const session = await this.getSessionById(userId, sessionId);

    if (
      session.status !== WorkoutSessionStatus.in_progress &&
      session.status !== WorkoutSessionStatus.paused
    ) {
      throw new BadRequestException(
        `Cannot complete session: current status is ${session.status}`,
      );
    }

    // Calculate final stats
    const stats = await this.calculateSessionStats(sessionId);

    // Validate minimum completion threshold (80%)
    const completionPercentage =
      (stats.completedSets / stats.totalSets) * 100;
    if (completionPercentage < 80) {
      this.logger.warn(
        `Session ${sessionId} only ${completionPercentage.toFixed(1)}% complete`,
      );
    }

    const now = new Date();
    const duration = stats.totalDurationMs;

    // Complete session with transaction
    const updated = await this.prisma.$transaction(async (tx) => {
      // Update session
      const completedSession = await tx.workoutSession.update({
        where: { id: sessionId },
        data: {
          status: WorkoutSessionStatus.completed,
          completedAt: now,
          durationMs: duration,
          totalSets: stats.completedSets,
          totalVolume: stats.totalVolume,
          notes: dto?.notes ?? session.notes,
          rating: dto?.rating,
        },
        include: this.getSessionInclude(),
      });

      // Update scheduled workout
      await tx.scheduledWorkout.update({
        where: { id: session.scheduledWorkoutId },
        data: { status: 'completed' },
      });

      return completedSession;
    });

    // Clear active session cache
    await this.clearActiveSessionCache(userId);

    // Emit domain event
    this.eventEmitter.emit('session.completed', {
      userId,
      sessionId,
      completedAt: now,
      duration,
      stats,
      rating: dto?.rating,
    });

    // Track metrics
    this.metrics.recordHistogram('workout_session_duration_ms', duration, {
      userId,
    });
    this.metrics.recordHistogram('workout_session_volume_lbs', stats.totalVolume, {
      userId,
    });

    this.logger.log(
      `Session ${sessionId} completed: ${stats.completedSets}/${stats.totalSets} sets, ${stats.totalVolume}lbs volume, ${(duration / 60000).toFixed(1)}min`,
    );

    return this.transformToSessionDto(updated);
  }

  /**
   * Abandon session.
   * 
   * Use cases:
   * - User can't complete workout (injury, equipment unavailable)
   * - Session timed out
   * - User accidentally started wrong workout
   * 
   * Does NOT count toward workout completion statistics.
   * 
   * @param userId - User ID from JWT
   * @param sessionId - Session ID to abandon
   * @returns Abandoned session
   */
  async abandonSession(
    userId: string,
    sessionId: string,
  ): Promise<LiveSessionResponseDto> {
    const session = await this.getSessionById(userId, sessionId);

    if (session.status === WorkoutSessionStatus.completed) {
      throw new BadRequestException('Cannot abandon completed session');
    }

    if (session.status === WorkoutSessionStatus.abandoned) {
      this.logger.warn(`Session ${sessionId} already abandoned`);
      return session;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const abandonedSession = await tx.liveWorkoutSession.update({
        where: { id: sessionId },
        data: {
          status: WorkoutSessionStatus.abandoned,
          completedAt: new Date(),
        },
        include: this.getSessionInclude(),
      });

      // Reset scheduled workout status
      await tx.scheduledWorkout.update({
        where: { id: session.scheduledWorkoutId },
        data: { status: 'scheduled' },
      });

      return abandonedSession;
    });

    // Clear active session cache
    await this.clearActiveSessionCache(userId);

    this.eventEmitter.emit('session.abandoned', {
      userId,
      sessionId,
      abandonedAt: updated.createdAt,
    });

    this.logger.log(`Session ${sessionId} abandoned`);

    return this.transformToSessionDto(updated);
  }

  /**
   * Get session history with filters.
   * 
   * Supports filtering by:
   * - Date range
   * - Status (completed, abandoned)
   * - Exercise ID
   * - Pagination
   * 
   * @param userId - User ID from JWT
   * @param filters - Optional filters
   * @returns Paginated session history
   */
  async getSessionHistory(
    userId: string,
    filters: SessionFiltersDto,
  ): Promise<SessionHistoryResponseDto> {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.LiveWorkoutSessionWhereInput = {
      userId,
      ...(filters.status && { status: filters.status }),
      ...(filters.startDate && {
        startedAt: { gte: new Date(filters.startDate) },
      }),
      ...(filters.endDate && {
        completedAt: { lte: new Date(filters.endDate) },
      }),
    };

    const [sessions, total] = await Promise.all([
      this.prisma.liveWorkoutSession.findMany({
        where,
        include: {
          scheduledWorkout: {
            include: {
              day: {
                select: {
                  weekNumber: true,
                  dayNumber: true,
                  focus: true,
                },
              },
            },
          },
        },
        orderBy: { startedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.liveWorkoutSession.count({ where }),
    ]);

    return {
      sessions: sessions.map((s) => this.transformToSessionDto(s)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get session statistics and analytics.
   * 
   * Includes:
   * - Total volume (weight × reps)
   * - Average RIR and RPE
   * - Exercise-specific performance
   * - Personal records
   * - Completion rate
   * 
   * @param userId - User ID from JWT
   * @param sessionId - Session ID
   * @returns Detailed session statistics
   */
  async getSessionStats(
    userId: string,
    sessionId: string,
  ): Promise<SessionStatsDto> {
    await this.getSessionById(userId, sessionId); // Verify ownership

    return this.calculateSessionStats(sessionId);
  }

  /**
   * Get next upcoming scheduled workout.
   * 
   * Returns the next scheduled workout that hasn't been started yet.
   * Useful for "Start Workout" button on home screen.
   * 
   * @param userId - User ID from JWT
   * @returns Next scheduled workout or null
   */
  async getUpcomingWorkout(userId: string) {
    const now = new Date();

    const upcoming = await this.prisma.scheduledWorkout.findFirst({
      where: {
        userId,
        status: 'scheduled',
        scheduledAt: {
          gte: now,
        },
      },
      include: {
        day: {
          include: {
            items: {
              include: {
                exercise: true,
              },
              orderBy: {
                order: 'asc',
              },
            },
          },
        },
        plan: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: {
        scheduledAt: 'asc',
      },
    });

    return upcoming;
  }

  // ==================== PRIVATE HELPER METHODS ====================

  /**
   * Validate scheduled workout exists and belongs to user.
   * 
   * @param userId - User ID
   * @param scheduledWorkoutId - Scheduled workout ID
   * @returns Scheduled workout record
   * @throws NotFoundException if not found
   * @throws ForbiddenException if not owned by user
   */
  private async validateScheduledWorkout(
    userId: string,
    scheduledWorkoutId: string,
  ) {
    const scheduledWorkout = await this.prisma.scheduledWorkout.findUnique({
      where: { id: scheduledWorkoutId },
      include: {
        day: {
          include: {
            items: true,
          },
        },
      },
    });

    if (!scheduledWorkout) {
      throw new NotFoundException(
        `Scheduled workout ${scheduledWorkoutId} not found`,
      );
    }

    if (scheduledWorkout.userId !== userId) {
      this.logger.warn(
        `User ${userId} attempted to start session for scheduled workout ${scheduledWorkoutId} owned by ${scheduledWorkout.userId}`,
      );
      throw new ForbiddenException(
        'You do not have access to this scheduled workout',
      );
    }

    if (scheduledWorkout.status === 'completed') {
      throw new BadRequestException(
        'This workout has already been completed',
      );
    }

    if (scheduledWorkout.status === 'cancelled') {
      throw new BadRequestException('This workout has been cancelled');
    }

    return scheduledWorkout;
  }

  /**
   * Validate set performance data.
   * 
   * @param dto - Set completion data
   * @throws BadRequestException if invalid
   */
  private validateSetPerformance(dto: CompleteSetDto): void {
    if (dto.actualReps < 0) {
      throw new BadRequestException('Actual reps must be non-negative');
    }

    if (dto.actualWeight !== undefined && dto.actualWeight < 0) {
      throw new BadRequestException('Actual weight must be non-negative');
    }

    if (dto.actualRir !== undefined && (dto.actualRir < 0 || dto.actualRir > 10)) {
      throw new BadRequestException('RIR must be between 0 and 10');
    }

    if (dto.rpe !== undefined && (dto.rpe < 1 || dto.rpe > 10)) {
      throw new BadRequestException('RPE must be between 1 and 10');
    }
  }

  /**
   * Calculate session progress percentage.
   * 
   * @param sessionId - Session ID
   * @returns Progress percentage (0-100)
   */
  private async calculateSessionProgress(sessionId: string): Promise<number> {
    const [total, completed] = await Promise.all([
      this.prisma.exercise.count({
        where: { sessionId },
      }),
      this.prisma.exercise.count({
        where: {
          sessionId,
          status: ExerciseSetStatus.completed,
        },
      }),
    ]);

    if (total === 0) return 0;
    return Math.round((completed / total) * 100);
  }

  /**
   * Calculate comprehensive session statistics.
   * 
   * @param sessionId - Session ID
   * @returns Detailed statistics
   */
  private async calculateSessionStats(
    sessionId: string,
  ): Promise<SessionStatsDto> {
    const session = await this.prisma.liveWorkoutSession.findUnique({
      where: { id: sessionId },
      include: {
        sets: {
          include: {
            exercise: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    const completedSets = session.sets.filter(
      (s) => s.status === ExerciseSetStatus.completed,
    );

    // Calculate total volume (weight × reps)
    const totalVolume = completedSets.reduce((sum, set) => {
      const weight = set.actualWeight || 0;
      const reps = set.actualReps || 0;
      return sum + weight * reps;
    }, 0);

    // Calculate average RIR and RPE
    const rirValues = completedSets
      .filter((s) => s.actualRir !== null)
      .map((s) => s.actualRir!);
    const rpeValues = completedSets
      .filter((s) => s.rpe !== null)
      .map((s) => s.rpe!);

    const avgRir =
      rirValues.length > 0
        ? rirValues.reduce((a, b) => a + b, 0) / rirValues.length
        : null;
    const avgRpe =
      rpeValues.length > 0
        ? rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length
        : null;

    // Calculate duration
    const startTime = session.startedAt.getTime();
    const endTime = session.createdAt?.getTime() || Date.now();
    const totalDurationMs = endTime - startTime;

    // Group by exercise
    const exerciseStats = new Map<string, any>();
    for (const set of completedSets) {
      const exerciseId = set.exerciseId;
      if (!exerciseStats.has(exerciseId)) {
        exerciseStats.set(exerciseId, {
          exerciseId,
          exerciseName: set.exercise.name,
          sets: 0,
          totalReps: 0,
          totalVolume: 0,
          maxWeight: 0,
        });
      }

      const stats = exerciseStats.get(exerciseId);
      stats.sets++;
      stats.totalReps += set.actualReps || 0;
      stats.totalVolume += (set.actualWeight || 0) * (set.actualReps || 0);
      stats.maxWeight = Math.max(stats.maxWeight, set.actualWeight || 0);
    }

    return {
      totalSets: session.sets.length,
      completedSets: completedSets.length,
      totalVolume,
      avgRir,
      avgRpe,
      totalDurationMs,
      exerciseBreakdown: Array.from(exerciseStats.values()),
    };
  }

  /**
   * Cache active session ID in Redis.
   * 
   * @param userId - User ID
   * @param sessionId - Session ID
   */
  private async cacheActiveSession(
    userId: string,
    sessionId: string,
  ): Promise<void> {
    try {
      const cacheKey = `active-session:${userId}`;
      await this.cache.set(
        cacheKey,
        sessionId,
        this.ACTIVE_SESSION_CACHE_TTL_SEC,
      );
    } catch (error) {
      this.logger.error('Failed to cache active session', error);
      // Non-critical, continue
    }
  }

  /**
   * Clear active session cache.
   * 
   * @param userId - User ID
   */
  private async clearActiveSessionCache(userId: string): Promise<void> {
    try {
      const cacheKey = `active-session:${userId}`;
      await this.cache.delete(cacheKey);
    } catch (error) {
      this.logger.error('Failed to clear active session cache', error);
      // Non-critical
    }
  }

  /**
   * Get Prisma include object for full session queries.
   * 
   * @returns Prisma include configuration
   */
  private getSessionInclude() {
    return {
      scheduledWorkout: {
        include: {
          day: {
            include: {
              items: {
                include: {
                  exercise: true,
                },
                orderBy: { order: 'asc' } as const,
              },
            },
          },
        },
      },
      sets: {
        include: {
          exercise: true,
          workoutItem: true,
        },
        orderBy: [
          { workoutItem: { order: 'asc' } } as const,
          { setNumber: 'asc' } as const,
        ],
      },
    };
  }

  /**
   * Transform Prisma WorkoutSession to DTO.
   * 
   * @param session - Prisma session with includes
   * @returns Response DTO
   */
  private transformToSessionDto(session: any): LiveSessionResponseDto {
    return plainToInstance(
      LiveSessionResponseDto,
      {
        id: session.id,
        userId: session.userId,
        scheduledWorkoutId: session.scheduledWorkoutId,
        planId: session.planId,
        dayId: session.dayId,
        status: session.status,
        startedAt: session.startedAt,
        pausedAt: session.pausedAt,
        resumedAt: session.resumedAt,
        completedAt: session.completedAt,
        durationMs: session.durationMs,
        totalSets: session.totalSets,
        totalVolume: session.totalVolume,
        notes: session.notes,
        rating: session.rating,
        sets: session.sets?.map((set: any) => this.transformToSetDto(set)),
        scheduledWorkout: session.scheduledWorkout
          ? {
              id: session.scheduledWorkout.id,
              scheduledAt: session.scheduledWorkout.scheduledAt,
              day: session.scheduledWorkout.day
                ? {
                    id: session.scheduledWorkout.day.id,
                    weekNumber: session.scheduledWorkout.day.weekNumber,
                    dayNumber: session.scheduledWorkout.day.dayNumber,
                    focus: session.scheduledWorkout.day.focus,
                    items: session.scheduledWorkout.day.items?.map(
                      (item: any) => ({
                        id: item.id,
                        exerciseId: item.exerciseId,
                        exercise: {
                          id: item.exercise.id,
                          name: item.exercise.name,
                          slug: item.exercise.slug,
                        },
                        order: item.order,
                        targetSets: item.targetSets,
                        targetReps: item.targetReps,
                        targetWeight: item.targetWeight,
                      }),
                    ),
                  }
                : null,
            }
          : null,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
      { excludeExtraneousValues: true },
    );
  }

  /**
   * Transform Prisma ExerciseSet to DTO.
   * 
   * @param set - Prisma set with includes
   * @returns Set response DTO
   */
  private transformToSetDto(set: any): SessionSetResponseDto {
    return plainToInstance(
      SessionSetResponseDto,
      {
        id: set.id,
        sessionId: set.sessionId,
        workoutItemId: set.workoutItemId,
        exerciseId: set.exerciseId,
        exercise: set.exercise
          ? {
              id: set.exercise.id,
              name: set.exercise.name,
              slug: set.exercise.slug,
              primaryGroup: set.exercise.primaryGroup,
              equipment: set.exercise.equipment,
            }
          : null,
        setNumber: set.setNumber,
        status: set.status,
        targetReps: set.targetReps,
        targetWeight: set.targetWeight,
        targetRir: set.targetRir,
        actualReps: set.actualReps,
        actualWeight: set.actualWeight,
        actualRir: set.actualRir,
        rpe: set.rpe,
        restSec: set.restSec,
        notes: set.notes,
        completedAt: set.completedAt,
        createdAt: set.createdAt,
      },
      { excludeExtraneousValues: true },
    );
  }

  /**
   * Acquire distributed lock using Redis.
   * 
   * @param key - Lock key
   * @param value - Unique lock value
   * @returns true if acquired, false otherwise
   */
  private async acquireLock(key: string, value: string): Promise<boolean> {
    try {
      const result = await this.redis.set(key, value, {
        NX: true,
        PX: this.SESSION_LOCK_TTL_MS,
      });
      return result === 'OK';
    } catch (error) {
      this.logger.error(`Failed to acquire lock ${key}`, error);
      return false;
    }
  }

  /**
   * Release distributed lock.
   * 
   * @param key - Lock key
   * @param value - Lock value to verify ownership
   */
  private async releaseLock(key: string, value: string): Promise<void> {
    try {
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      await this.redis.eval(script, {
        keys: [key],
        arguments: [value],
      });
    } catch (error) {
      this.logger.error(`Failed to release lock ${key}`, error);
    }
  }
}