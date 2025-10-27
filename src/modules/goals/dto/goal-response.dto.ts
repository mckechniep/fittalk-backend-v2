import { GoalType, GoalStatus } from '@prisma/client';

/**
 * Response DTO for goal data
 * 
 * Returns complete goal information including:
 * - Core goal data (type, description, dates, weights)
 * - Status tracking
 * - Optional linked workout plan details
 * - Timestamps for audit trail
 * 
 * Design: Rich response with related data for frontend
 */
export class GoalResponseDto {
  id: string;
  userId: string;
  type: GoalType;
  description: string | null;
  targetDate: Date | null;
  startWeightKg: number | null;
  targetWeightKg: number | null;
  status: GoalStatus;
  planId: string | null;
  createdAt: Date;
  updatedAt: Date;

  // Optional: Include linked workout plan details
  plan?: {
    id: string;
    title: string;
    status: string;
  } | null;
}