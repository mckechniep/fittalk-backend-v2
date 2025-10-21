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
     * Start data of the week to schedule (ISO format: YYY-MM-DD).
     * Should be Monday (or user's configured week start day).
     * 
     * Examples:
     * - "2025-01-13" (Monday)
     * - "2025-01-20" (next Monday)
     * Srvice converts to user's timezone using Preference.timezone.
     */
    @IsDateString()
    weekStart: string

    
}