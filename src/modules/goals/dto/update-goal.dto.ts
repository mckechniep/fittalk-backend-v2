import { IsString, IsOptional, IsDateString, IsNumber, IsUUID } from 'class-validator';

/**
 * DTO for updating an existing goal
 * 
 * All fields are optional - only update what's provided.
 * Type and status are NOT updatable here (use PATCH /goals/:id/status for status changes).
 * 
 * Use cases:
 * - User adjusts target date
 * - User updates description
 * - User changes target weight
 * - User links/unlinks workout plan
 * 
 * Design: Partial updates only, type/status require separate endpoints for safety
 */
export class UpdateGoalDto {
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