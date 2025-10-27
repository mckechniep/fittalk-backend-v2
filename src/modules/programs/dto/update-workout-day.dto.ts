import { IsEnum, IsString, IsOptional } from 'class-validator';
import { SessionType } from '@prisma/client';

/**
 * DTO for updating a workout day
 * 
 * Note: weekNumber and dayNumber are NOT updatable (they define the day's identity)
 * To move a day, delete and recreate
 */
export class UpdateWorkoutDayDto {
  @IsEnum(SessionType)
  @IsOptional()
  focus?: SessionType;

  @IsString()
  @IsOptional()
  notes?: string;
}