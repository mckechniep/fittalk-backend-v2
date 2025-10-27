import { IsUUID, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * DTO for creating a workout item (exercise within a day)
 * 
 * Required fields:
 * - exerciseId: Reference to Exercise table
 * - order: Position in workout (1, 2, 3...)
 * - targetSets: How many sets
 * 
 * Optional fields:
 * - targetReps: Target reps per set
 * - targetRir: Reps In Reserve (RPE-based intensity)
 * - targetWeight: Weight in kg (can be null for bodyweight)
 * - restSeconds: Rest period between sets
 * - notes: Exercise-specific notes (tempo, form cues, etc.)
 * 
 * Design decisions:
 * - Flexible prescription: Some exercises use reps, others time-based, etc.
 * - RIR (Reps In Reserve) is primary intensity metric per requirements
 * - order allows proper sequencing (compounds first, accessories later)
 * 
 * Example:
 * {
 *   "exerciseId": "uuid-for-barbell-squat",
 *   "order": 1,
 *   "targetSets": 4,
 *   "targetReps": 6,
 *   "targetRir": 2,
 *   "targetWeight": 100,
 *   "restSeconds": 180,
 *   "notes": "Tempo: 3-1-1-0, focus on depth"
 * }
 */
export class CreateWorkoutItemDto {
  @IsUUID()
  exerciseId: string;

  @IsInt()
  @Min(1)
  order: number;

  @IsInt()
  @Min(1)
  targetSets: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  targetReps?: number;

  @IsNumber()
  @IsOptional()
  targetRir?: number;

  @IsNumber()
  @IsOptional()
  targetWeight?: number;

  @IsInt()
  @IsOptional()
  restSeconds?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}