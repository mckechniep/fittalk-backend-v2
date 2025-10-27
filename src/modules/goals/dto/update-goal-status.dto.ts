import { IsEnum } from 'class-validator';
import { GoalStatus } from '@prisma/client';

/**
 * DTO for updating goal status
 * 
 * Status lifecycle:
 * - active: Goal is being worked on
 * - paused: Temporarily stopped (injury, life events)
 * - achieved: Goal successfully completed
 * - abandoned: User decided to stop pursuing this goal
 * 
 * Design decision: Separate endpoint for status changes
 * Why:
 * - Clear audit trail for goal lifecycle
 * - Different business logic for status vs content updates
 * - Frontend can show status-specific UI (celebrate achievements, etc.)
 * 
 * Example:
 * PATCH /goals/:id/status
 * { "status": "achieved" }
 */
export class UpdateGoalStatusDto {
  @IsEnum(GoalStatus)
  status: GoalStatus;
}