// dtos/availability-window.dto.ts
import { IsInt, Min, Max, IsArray, ValidateNested, IsOptional, IsString, IsUUID } from 'class-validator'
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
}