import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * DTO for updating a workout item
 * 
 * All fields optional - partial updates
 * exerciseId is NOT updatable (would change the exercise entirely - delete/recreate instead)
 */
export class UpdateWorkoutItemDto {
  @IsInt()
  @Min(1)
  @IsOptional()
  order?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  targetSets?: number;

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