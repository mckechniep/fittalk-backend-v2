import { IsDateString, IsOptional, IsBoolean, IsUUID } from 'class-validator'


/**
 * Input DTO for generating weekly workout schedule.
 * 
 * Design decisions:
 * - weekStart as ISO date string (YYYY-MM-DD) for clarity and timezone-agnostic
 * - Optional planId: defaults to user's active plan if not provided
 * - Optional regenerate flag: allows force-regeneration even if week already scheduled
 * - No userId: extracted from JWT (security)
 * 
 * Use cases:
 * - Initial schedule generation: user completes consultation, app generates first week
 * - Manual regeneration: user updates availability or plan, requests new schedule
 * - Auto regeneration: cron job generates next week for all users
 * 
 * Validation:
 * - weekStart must be valid ISO date (enforced by @IsDateString)
 * - Service validates weekStart is Monday (or configurable week start day)
 * - Service validates planId belongs to user (if provided)
 */
export class ScheduleWeekDto {
    /**
     * Start date of the week to schedule (ISO format: YYY-MM-DD).
     * Should be Monday (or user's configured week start day).
     * 
     * Examples:
     * - "2025-01-13" (Monday)
     * - "2025-01-20" (next Monday)
     * Service converts to user's timezone using Preference.timezone.
     */
    @IsDateString()
    weekStart: string

/**
 * Specific plan to schedule.
 * If not provided, uses user's active plan (status='active').
 * 
 * Use case: User has multiple plans (e.g., bulk phase, cut phase)
 */
@IsOptional()
@IsUUID()
planned?: string 

/**
 * Force regeneration even if week already scheduled.
 * Default: false (skip if week already has scheduled workouts)
 * 
 * Use cases:
 * - User updated availability -> regenerate to fit new schedule
 * - User modified plan -> regenerate with new workouts
 * - Fix incorrect schedule -> force regenerate
 * 
 * Behavior:
 * - true: Delete existing scheduled workouts for this week, generate fresh
 * - false: Return existing schedule if present, generate only if missing
 */
@IsOptional()
@IsBoolean()
regenerate?: boolean
}

/**
 * Query DTO for fetching scheduleed workouts.
 * Used with GET endpoint.
 */
export class GetScheduleQueryDto {
/**
 * Start date of the week to fetch (YYYY-MM-DD).
 * Defaults to current week if not provided.
 */
@IsOptional()
@IsDateString()
weekStart?: string

/**
 * Filter by plan ID.
 * Returns all plans if not provided.
 */
@IsOptional()
@IsUUID()
planId?: string

@IsOptional()
status?: 'scheduled' | 'in_progress' | 'completed' | 'skipped' | 'canceled'
}