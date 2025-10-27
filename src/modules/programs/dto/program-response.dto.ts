import { PlanStatus, SessionType } from '@prisma/client';

/**
 * Response DTOs for program data
 * 
 * Hierarchical structure:
 * - Program contains Days
 * - Days contain Items
 * - Items reference Exercises
 */

export class WorkoutItemResponseDto {
  id: string;
  dayId: string;
  order: number;
  exerciseId: string;
  targetSets: number;
  targetReps: number | null;
  targetRir: number | null;
  targetWeight: number | null;
  restSeconds: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;

  // Include exercise details
  exercise?: {
    id: string;
    slug: string;
    name: string;
    primaryGroup: string;
    equipment: string;
  };
}

export class WorkoutDayResponseDto {
  id: string;
  planId: string;
  weekNumber: number;
  dayNumber: number;
  focus: SessionType;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;

  // Include items
  items?: WorkoutItemResponseDto[];
}

export class ProgramResponseDto {
  id: string;
  userId: string;
  title: string;
  status: PlanStatus;
  weeks: number;
  sourceJson: any;
  createdAt: Date;
  updatedAt: Date;

  // Include days (which include items)
  days?: WorkoutDayResponseDto[];
}