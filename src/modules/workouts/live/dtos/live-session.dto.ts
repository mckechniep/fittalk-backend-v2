// live/dtos/live-session.dto.ts
import {
  IsString,
  IsOptional,
  IsUUID,
  IsBoolean,
  IsDateString,
} from 'class-validator';

/**
 * DTO for creating a live workout session.
 */
export class CreateLiveSessionDto {
  @IsOptional()
  @IsUUID()
  workoutPlanId?: string;

  @IsOptional()
  @IsUUID()
  dayId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  private?: boolean;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

/**
 * DTO for updating live session metadata.
 */
export class UpdateLiveSessionDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  private?: boolean;

  @IsOptional()
  @IsUUID()
  workoutPlanId?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

/**
 * DTO for live events (exercise change, rest, etc.)
 */
export class LiveEventDto {
  @IsString()
  type: string;

  @IsOptional()
  data?: any;
}
