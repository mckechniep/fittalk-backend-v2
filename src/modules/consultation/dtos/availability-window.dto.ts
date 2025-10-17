// dtos/availability-window.dto.ts
import { IsInt, Min, Max, IsArray, ValidateNested, IsOptional, IsUUID } from 'class-validator'
import { Type, Expose } from 'class-transformer'

/**
 * Single availability window within a week.
 * Represents a recurring time block when user is available for workouts.
 * 
 * Design decisions:
 * - Uses minutes from midnight (0-1439) for time representation
 * - dayOfWeek: 0=Sunday, 1=Monday ... 6=Saturday (JavaScript Date.getDay() convention)
 * - Validation ensures logical time ranges but NOT overlap detection (service layer handles that)
 * - Priority allows ranking preferred workout times (higher = more preferred)
 * 
 * Example: Monday 9:00 AM - 5:00 PM
 * { dayOfWeek: 1, startMin: 540, endMin: 1020, priority: 1 }
 */

export class AvailabilityWindowDto {
    /**
   * Day of week: 0 (Sunday) through 6 (Saturday).
   * Matches JavaScript Date.getDay() for consistency.
   */
    @IsInt()
    @Min(0)
    @Max(6)
    dayOfWeek: number
    /**
   * Start time in minutes from midnight (0-1439).
   * Example: 540 = 9:00 AM, 1020 = 5:00 PM
   * 
   * Calculation: (hours * 60) + minutes
   * - 9:00 AM = (9 * 60) + 0 = 540
   * - 2:30 PM = (14 * 60) + 30 = 870
   */

@IsInt()
@Min(0)
@Max(1439)
startMin: number

/**
   * End time in minutes from midnight (0-1439).
   * Must be greater than startMin (validated in service layer to avoid circular DTO dependency).
   * 
   * Note: Does NOT support overnight windows (e.g., 11 PM - 2 AM).
   * For overnight, create two windows: 
   * - Day 1: 23:00 (1380) - 23:59 (1439)
   * - Day 2: 00:00 (0) - 02:00 (120)
   */

@IsInt()
@Min(0)
@Max(1439)
endMin: number

/**
 * Priority ranking for scheduling algorithm.
 * Higher values = more preferred times for workouts.
 * 
 * Use cases:
 * - 0 = Available but not ideal
 * - 1 = Preferred Time
 * - 2 = Most Preferred Time
 */
@IsInt()
@Min(0)
@Max(10)
@IsOptional()
priority?: number
}

/**
 * Batch create/update availability windows.
 * Replaces ALL existing windows for the user (NOT incremental).
 * 
 * Design rationale:
 * - "Replace all" is simpler than managing adds/updates/deletes separately
 * - Mobile typically sends full weekly schedule (easier UX)
 * - Service wraps in transaction: delete existing → insert new
 * - Prevents partial state bugs from failed incremental updates
 * 
 * Use cases:
 * - Initial onboarding: user sets up weekly schedule
 * - Schedule change: user updates availability (e.g., new work hours)
 * - Consultation flow: availability submitted after goal-setting
 */

export class UpsertAvailabilityDto {
/**
   * Full set of availability windows.
   * Empty array = user has no regular availability (on-demand workouts only).
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AvailabilityWindowDto)
  windows: AvailabilityWindowDto[]
}
/**
 * Response DTO for availability windows.
 * Includes database ID for potential individual deletion.
 */

export class AvailabilityWindowResponseDto {
    @Expose()
    id: string
    @Expose()
    userId: string
    @Expose()
    dayOfWeek: number
    @Expose()
    startMin: number
    @Expose()
    endMin: number
    @Expose()
    priority: number
    @Expose()
    createdAt: Date
    @Expose()
    updatedAt: Date
}
/**
 * Optional: Delete individual window by ID.
 * Use case: User wants to remove one specific time block without re-sending full schedule.
 */
export class DeleteAvailabilityDto {
    @IsUUID()
    id: string
}