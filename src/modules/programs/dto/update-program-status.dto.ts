import { IsEnum } from 'class-validator';
import { PlanStatus } from '@prisma/client';

/**
 * DTO for updating program status
 * 
 * Status lifecycle:
 * - draft: Program being built (not ready for use)
 * - active: Program in use
 * - archived: Program completed or no longer in use
 * 
 * Design: Separate endpoint for status changes
 * Why: Clear audit trail, different business logic
 */
export class UpdateProgramStatusDto {
  @IsEnum(PlanStatus)
  status: PlanStatus;
}