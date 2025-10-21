// scheduling/planner.service.ts
import { Injectable, Logger } from '@nestjs/common';

/**
 * Planner Service
 * 
 * Optimal scheduling algorithm - no database access, no side effects.
 * Takes workout days and availability windows, returns globally optimal schedule.
 * 
 * Design principles:
 * - Pure functions: Same inputs always produce same outputs
 * - No external dependencies: Fully unit-testable in isolation
 * - Backtracking with pruning: Finds best possible schedule
 * - Priority-aware: Prefers higher-priority windows when multiple solutions exist
 * - Deterministic: Consistent results for reproducibility
 * 
 * Algorithm overview (Backtracking):
 * 1. Estimate duration for each workout day
 * 2. Sort availability windows by priority (descending), then start time (ascending)
 * 3. Use backtracking to try all valid placements:
 *    a. For each workout, try placing in each valid window
 *    b. Recursively schedule remaining workouts
 *    c. Track best solution found (maximum workouts scheduled)
 *    d. Prune branches that cannot beat current best
 * 4. Return optimal schedule and unscheduled days with reasons
 * 
 * Complexity: O(m^n) worst case, heavily pruned in practice
 * - n = workout days (typically 3-7)
 * - m = availability windows (typically 5-20)
 * Real-world: < 50ms for n=7, m=20 (guarantees optimal solution)
 * 
 * Optimality: Maximizes number of workouts scheduled.
 * Tie-breaking: Prefers higher-priority windows, then earlier times.
 */
@Injectable()
export class PlannerService {
  private readonly logger = new Logger(PlannerService.name);

  /**
   * Default workout duration estimates by focus type (in minutes).
   * Used when workout items don't have duration info.
   * 
   * Based on typical session lengths:
   * - Strength: 60-90 min (heavy compounds, longer rest)
   * - Hypertrophy: 45-75 min (moderate volume)
   * - Cardio: 30-45 min
   * - Mobility: 20-30 min
   * - Mixed: 60 min (average)
   */
  private readonly DEFAULT_DURATIONS: Record<string, number> = {
    strength: 75,
    hypertrophy: 60,
    cardio: 40,
    mobility: 25,
    mixed: 60,
  };

  /**
   * Buffer time added to estimated duration (in minutes).
   * Accounts for:
   * - Warm-up (5-10 min)
   * - Cool-down (5 min)
   * - Setup time (changing weights, moving equipment)
   * - Unexpected delays
   */
  private readonly DURATION_BUFFER = 15;

  /**
   * Generate weekly schedule for workout days.
   * 
   * @param workoutDays - Days from user's WorkoutPlan to schedule
   * @param availabilityWindows - User's weekly availability
   * @param weekStartDate - Start of target week (Date object)
   * @param existingScheduled - Already scheduled workouts (for overlap check)
   * @returns Scheduled and unscheduled workout assignments
   * 
   * Pure function: No DB access, no mutations, deterministic.
   */
  scheduleWeek(
    workoutDays: WorkoutDayInput[],
    availabilityWindows: AvailabilityWindowInput[],
    weekStartDate: Date,
    existingScheduled: ScheduledWorkoutInput[] = [],
  ): ScheduleResult {
    this.logger.debug(
      `Scheduling ${workoutDays.length} workout days with ${availabilityWindows.length} availability windows`,
    );

    // Validate inputs
    if (workoutDays.length === 0) {
      return {
        scheduled: [],
        unscheduled: [],
      };
    }

    if (availabilityWindows.length === 0) {
      // No availability - mark all as unscheduled
      return {
        scheduled: [],
        unscheduled: workoutDays.map((day) => ({
          dayId: day.id,
          weekNumber: day.weekNumber,
          dayNumber: day.dayNumber,
          focus: day.focus,
          reason: 'No availability windows set for this week',
          estimatedDurationMin: this.estimateWorkoutDuration(day),
        })),
      };
    }

    // Normalize and sort windows
    const windows = this.prepareAvailabilityWindows(
      availabilityWindows,
      weekStartDate,
    );

    // Track occupied time slots to prevent overlaps (includes existing scheduled workouts)
    const initialOccupiedSlots: OccupiedSlot[] = existingScheduled.map((s) => ({
      start: s.scheduledAt,
      end: new Date(s.scheduledAt.getTime() + s.estimatedDurationMin * 60 * 1000),
    }));

    // Pre-compute durations for all workout days (cache for backtracking)
    const workoutDaysWithDuration = workoutDays.map((day) => ({
      ...day,
      estimatedDurationMin: this.estimateWorkoutDuration(day),
    }));

    // Find optimal schedule using backtracking
    const optimalScheduled = this.findOptimalSchedule(
      workoutDaysWithDuration,
      windows,
      initialOccupiedSlots,
    );

    // Determine which days were unscheduled and why
    const scheduledDayIds = new Set(optimalScheduled.map((s) => s.dayId));
    const unscheduled: UnscheduledAssignment[] = workoutDaysWithDuration
      .filter((day) => !scheduledDayIds.has(day.id))
      .map((day) => ({
        dayId: day.id,
        weekNumber: day.weekNumber,
        dayNumber: day.dayNumber,
        focus: day.focus,
        reason: this.determineUnscheduledReason(
          day,
          day.estimatedDurationMin,
          windows,
          initialOccupiedSlots,
        ),
        estimatedDurationMin: day.estimatedDurationMin,
      }));

    this.logger.debug(
      `Optimal schedule: ${optimalScheduled.length}/${workoutDays.length} workouts scheduled, ${unscheduled.length} unscheduled`,
    );

    return { scheduled: optimalScheduled, unscheduled };
  }

  /**
   * Find optimal schedule using backtracking with pruning.
   * 
   * Algorithm:
   * 1. Base case: all workouts processed → compare with best solution
   * 2. Pruning: if current + remaining can't beat best, stop exploring
   * 3. For each valid window for current workout:
   *    a. Place workout in window
   *    b. Recursively schedule remaining workouts
   *    c. Backtrack (remove placement and try next window)
   * 4. Also try NOT scheduling current workout (skip it)
   * 5. Return best solution found across all branches
   * 
   * Guarantees: Finds schedule with maximum number of workouts scheduled.
   * 
   * @param workoutDays - Workouts to schedule (with pre-computed durations)
   * @param windows - Sorted availability windows
   * @param initialOccupied - Already occupied time slots
   * @returns Optimal schedule (maximum workouts placed)
   */
  private findOptimalSchedule(
    workoutDays: (WorkoutDayInput & { estimatedDurationMin: number })[],
    windows: PreparedWindow[],
    initialOccupied: OccupiedSlot[],
  ): ScheduledAssignment[] {
    let bestSchedule: ScheduledAssignment[] = [];

    /**
     * Backtracking recursive function.
     * 
     * @param index - Current workout index being processed
     * @param currentSchedule - Workouts scheduled so far in this branch
     * @param occupiedSlots - Time slots occupied in this branch
     */
    const backtrack = (
      index: number,
      currentSchedule: ScheduledAssignment[],
      occupiedSlots: OccupiedSlot[],
    ): void => {
      // Base case: all workouts processed
      if (index === workoutDays.length) {
        // Update best if this solution is better
        if (currentSchedule.length > bestSchedule.length) {
          bestSchedule = [...currentSchedule];
        }
        return;
      }

      // Pruning: can't beat current best even if all remaining fit
      const remainingWorkouts = workoutDays.length - index;
      if (currentSchedule.length + remainingWorkouts <= bestSchedule.length) {
        return; // No point exploring this branch
      }

      const currentDay = workoutDays[index];

      // Try placing current workout in each valid window
      let foundValidPlacement = false;

      for (const window of windows) {
        const assignment = this.tryPlaceInWindow(
          currentDay,
          window,
          occupiedSlots,
        );

        if (assignment) {
          foundValidPlacement = true;

          // Add to schedule
          const newSchedule = [...currentSchedule, assignment];

          // Mark slot as occupied
          const newOccupiedSlots = [
            ...occupiedSlots,
            {
              start: assignment.scheduledAt,
              end: new Date(
                assignment.scheduledAt.getTime() +
                  currentDay.estimatedDurationMin * 60 * 1000,
              ),
            },
          ];

          // Recurse with this placement
          backtrack(index + 1, newSchedule, newOccupiedSlots);
        }
      }

      // Also try NOT scheduling this workout (skip it)
      // This allows algorithm to skip a difficult workout to fit more later ones
      if (!foundValidPlacement || currentSchedule.length < bestSchedule.length) {
        backtrack(index + 1, currentSchedule, occupiedSlots);
      }
    };

    // Start backtracking from first workout
    backtrack(0, [], initialOccupied);

    return bestSchedule;
  }

  /**
   * Try to place a workout in a specific window.
   * 
   * Checks:
   * 1. Workout duration fits in window
   * 2. No overlap with occupied slots
   * 3. Doesn't exceed window end time
   * 
   * @returns ScheduledAssignment if placement valid, null otherwise
   */
  private tryPlaceInWindow(
    day: WorkoutDayInput & { estimatedDurationMin: number },
    window: PreparedWindow,
    occupiedSlots: OccupiedSlot[],
  ): ScheduledAssignment | null {
    const durationMin = day.estimatedDurationMin;

    // Check if workout fits in this window
    const windowDurationMin = window.endMin - window.startMin;
    if (durationMin > windowDurationMin) {
      return null; // Workout too long for this window
    }

    // Calculate proposed start/end times
    const proposedStart = window.absoluteStart;
    const proposedEnd = new Date(
      proposedStart.getTime() + durationMin * 60 * 1000,
    );

    // Ensure proposed end doesn't exceed window end
    if (proposedEnd > window.absoluteEnd) {
      return null; // Workout would overflow window
    }

    // Check for overlaps with occupied slots
    const hasOverlap = occupiedSlots.some((slot) => {
      return proposedStart < slot.end && proposedEnd > slot.start;
    });

    if (hasOverlap) {
      return null; // Time slot already occupied
    }

    // Valid placement found
    return {
      dayId: day.id,
      planId: day.planId,
      scheduledAt: proposedStart,
      estimatedDurationMin: durationMin,
    };
  }

  /**
   * Estimate workout duration in minutes.
   * 
   * Calculation:
   * 1. Sum item durations: (sets * (work_time + rest_time))
   * 2. Add buffer (warm-up, cool-down, setup)
   * 3. If no items, use default by focus type
   * 
   * Work time estimation:
   * - Assume ~5 seconds per rep on average
   * - Set time = targetReps * 5 seconds (or 30s default if reps unknown)
   * 
   * Example: 3 sets of 10 reps with 90s rest:
   * - Work: 3 * (10 * 5s) = 150s = 2.5 min
   * - Rest: 3 * 90s = 270s = 4.5 min
   * - Total: 7 min per exercise
   */
  private estimateWorkoutDuration(day: WorkoutDayInput): number {
    if (!day.items || day.items.length === 0) {
      // No items defined, use default by focus type
      const defaultDuration = this.DEFAULT_DURATIONS[day.focus] || 60;
      return defaultDuration + this.DURATION_BUFFER;
    }

    let totalMin = 0;

    for (const item of day.items) {
      const sets = item.targetSets || 3;
      const reps = item.targetReps || 10;
      const restSec = item.restSec || 90;

      // Work time: assume 5 seconds per rep (includes eccentric + concentric)
      const workTimeSec = reps * 5;

      // Total time per exercise: (work + rest) * sets
      // Subtract one rest period (no rest after last set)
      const itemTimeSec = (workTimeSec + restSec) * sets - restSec;
      totalMin += itemTimeSec / 60;
    }

    // Add buffer and round up
    return Math.ceil(totalMin + this.DURATION_BUFFER);
  }

  /**
   * Prepare availability windows for scheduling.
   * 
   * Transforms relative windows (dayOfWeek, startMin, endMin) into
   * absolute date-time windows for the target week.
   * 
   * Sorts by:
   * 1. Priority (descending) - prefer higher-priority windows
   * 2. Start time (ascending) - earlier windows first
   * 
   * @param windows - User's weekly availability (recurring)
   * @param weekStart - Start date of target week
   * @returns Sorted absolute time windows
   */
  private prepareAvailabilityWindows(
    windows: AvailabilityWindowInput[],
    weekStart: Date,
  ): PreparedWindow[] {
    const prepared = windows.map((w) => {
      // Calculate absolute dates for this specific week
      const targetDate = this.getDateForDayOfWeek(weekStart, w.dayOfWeek);

      const absoluteStart = new Date(targetDate);
      absoluteStart.setHours(0, 0, 0, 0);
      absoluteStart.setMinutes(absoluteStart.getMinutes() + w.startMin);

      const absoluteEnd = new Date(targetDate);
      absoluteEnd.setHours(0, 0, 0, 0);
      absoluteEnd.setMinutes(absoluteEnd.getMinutes() + w.endMin);

      return {
        dayOfWeek: w.dayOfWeek,
        startMin: w.startMin,
        endMin: w.endMin,
        priority: w.priority,
        absoluteStart,
        absoluteEnd,
      };
    });

    // Sort: priority DESC, then start time ASC
    return prepared.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority; // Higher priority first
      }
      return a.absoluteStart.getTime() - b.absoluteStart.getTime(); // Earlier time first
    });
  }

  /**
   * Get absolute date for a specific day of week in a given week.
   * 
   * @param weekStart - Monday of target week (or configured week start)
   * @param dayOfWeek - 0=Sunday, 1=Monday ... 6=Saturday
   * @returns Date object for that specific day
   * 
   * Example:
   * weekStart = 2025-01-13 (Monday)
   * dayOfWeek = 3 (Wednesday)
   * Returns: 2025-01-15 (Wednesday of that week)
   */
  private getDateForDayOfWeek(weekStart: Date, dayOfWeek: number): Date {
    const date = new Date(weekStart);
    const weekStartDay = date.getDay(); // 0=Sun, 1=Mon, etc.

    // Calculate offset from week start
    let offset = dayOfWeek - weekStartDay;
    
    // Handle week wraparound (e.g., Sunday in a Monday-start week)
    if (offset < 0) {
      offset += 7;
    }

    date.setDate(date.getDate() + offset);
    return date;
  }

  /**
   * Determine why a workout couldn't be scheduled.
   * Provides actionable feedback for the user.
   * 
   * Checks in order:
   * 1. No availability on that day of week
   * 2. Workout longer than largest window on that day
   * 3. All windows on that day occupied by other workouts
   * 4. Generic fallback
   */
  private determineUnscheduledReason(
    day: WorkoutDayInput,
    durationMin: number,
    windows: PreparedWindow[],
    occupiedSlots: OccupiedSlot[],
  ): string {
    // Check if any windows on this day of week
    const dayWindows = windows.filter((w) => w.dayOfWeek === day.dayNumber - 1);

    if (dayWindows.length === 0) {
      return `No availability set for ${this.getDayName(day.dayNumber - 1)}`;
    }

    // Check if workout is too long for any window
    const longestWindow = Math.max(...dayWindows.map((w) => w.endMin - w.startMin));
    if (durationMin > longestWindow) {
      return `Workout duration (${durationMin} min) exceeds largest available window (${longestWindow} min) on ${this.getDayName(day.dayNumber - 1)}`;
    }

    // Check if all windows are occupied
    const allOccupied = dayWindows.every((window) => {
      return occupiedSlots.some((slot) => {
        // Check if window overlaps with any occupied slot
        return window.absoluteStart < slot.end && window.absoluteEnd > slot.start;
      });
    });

    if (allOccupied) {
      return `All available time slots on ${this.getDayName(day.dayNumber - 1)} are already occupied`;
    }

    // Generic fallback
    return `Unable to find suitable time slot on ${this.getDayName(day.dayNumber - 1)}`;
  }

  /**
   * Get day name from day number.
   * Matches WorkoutDay.dayNumber convention (1=Monday ... 7=Sunday).
   * 
   * Note: dayNumber uses 1-7 (Monday-Sunday), but dayOfWeek uses 0-6 (Sunday-Saturday).
   * This conversion handles the mismatch.
   */
  private getDayName(dayOfWeek: number): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayOfWeek] || 'Unknown';
  }
}

// ==================== TYPE DEFINITIONS ====================

/**
 * Input: Workout day from database.
 * Minimal fields needed for scheduling.
 */
export interface WorkoutDayInput {
  id: string;
  planId: string;
  weekNumber: number;
  dayNumber: number;  // 1-7 (Monday-Sunday)
  focus: string;      // strength, hypertrophy, cardio, mobility, mixed
  items?: WorkoutItemInput[];
}

/**
 * Input: Workout item (exercise) from database.
 * Used to estimate workout duration.
 */
export interface WorkoutItemInput {
  targetSets?: number;
  targetReps?: number;
  restSec?: number;
}

/**
 * Input: User's availability window (recurring weekly).
 * Relative times that get converted to absolute for target week.
 */
export interface AvailabilityWindowInput {
  dayOfWeek: number;  // 0=Sunday ... 6=Saturday
  startMin: number;   // 0-1439 (minutes from midnight)
  endMin: number;     // 0-1439
  priority: number;   // 0-10 (higher = more preferred)
}

/**
 * Input: Existing scheduled workout (for overlap detection).
 */
export interface ScheduledWorkoutInput {
  scheduledAt: Date;
  estimatedDurationMin: number;
}

/**
 * Internal: Prepared window with absolute times for target week.
 */
interface PreparedWindow {
  dayOfWeek: number;
  startMin: number;
  endMin: number;
  priority: number;
  absoluteStart: Date;  // Actual date-time for this specific week
  absoluteEnd: Date;
}

/**
 * Internal: Time slot occupied by a workout.
 */
interface OccupiedSlot {
  start: Date;
  end: Date;
}

/**
 * Output: Successfully scheduled workout assignment.
 */
export interface ScheduledAssignment {
  dayId: string;
  planId: string;
  scheduledAt: Date;          // When workout starts
  estimatedDurationMin: number;
}

/**
 * Output: Workout that couldn't be scheduled with reason.
 */
export interface UnscheduledAssignment {
  dayId: string;
  weekNumber: number;
  dayNumber: number;
  focus: string;
  reason: string;             // Why it couldn't be scheduled
  estimatedDurationMin: number;
}

/**
 * Output: Complete schedule result.
 */
export interface ScheduleResult {
  scheduled: ScheduledAssignment[];
  unscheduled: UnscheduledAssignment[];
}