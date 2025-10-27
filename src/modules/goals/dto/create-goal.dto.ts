import { IsString, IsOptional, IsEnum, IsDateString, IsNumber, IsUUID } from 'class-validator';
import { GoalType } from '@prisma/client';

/**
 * DTO for creating a new goal
 * 
 * Required fields:
 * - type: The goal category (fat_loss, muscle_gain, performance, maintenance)
 * 
 * Optional fields:
 * - description: User's personal goal description
 * - targetDate: When user wants to achieve the goal
 * - startWeightKg: Current weight (for weight-related goals)
 * - targetWeightKg: Target weight (for weight-related goals)
 * - planId: Link to a specific workout plan (optional)
 * 
 * Design decisions:
 * - All fields optional except type (flexibility for quick goal creation)
 * - Weight tracking built-in for common fitness goals
 * - planId allows optional linking to workout programs
 * 
 * Example:
 * {
 *   "type": "fat_loss",
 *   "description": "Lose 10kg for summer",
 *   "targetDate": "2025-06-01",
 *   "startWeightKg": 85.5,
 *   "targetWeightKg": 75.5
 * }
 */
export class CreateGoalDto {
  @IsEnum(GoalType)
  type: GoalType;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  targetDate?: string;

  @IsNumber()
  @IsOptional()
  startWeightKg?: number;

  @IsNumber()
  @IsOptional()
  targetWeightKg?: number;

  @IsUUID()
  @IsOptional()
  planId?: string;
}