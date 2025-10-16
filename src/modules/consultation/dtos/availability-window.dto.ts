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