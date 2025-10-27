import { IsInt, IsEnum, IsString, IsOptional, Min, Max } from 'class-validator';
import { SessionType } from '@prisma/client';

/**
 * DTO for creating a workout day within a program
 * 
 * Required fields:
 * - weekNumber: Which week (1-based, e.g., week 1, week 2)
 * - dayNumber: Which day of week (1=Monday ... 7=Sunday)
 * - focus: Session type (strength, hypertrophy, cardio, mobility, mixed)
 * 
 * Optional fields:
 * - notes: Coach notes, instructions, etc.
 * 
 * Design decisions:
 * - weekNumber + dayNumber create unique identifier within a plan
 * - No restriction on overlapping days (some users want multiple sessions per day)
 * - focus determines workout style and intensity
 * 
 * Example:
 * {
 *   "weekNumber": 1,
 *   "dayNumber": 1,
 *   "focus": "strength",
 *   "notes": "Focus on compound lifts, progressive overload"
 * }
 */
export class CreateWorkoutDayDto {
  @IsInt()
  @Min(1)
  @Max(52)
  weekNumber: number;

  @IsInt()
  @Min(1)
  @Max(7)
  dayNumber: number;

  @IsEnum(SessionType)
  focus: SessionType;

  @IsString()
  @IsOptional()
  notes?: string;
}