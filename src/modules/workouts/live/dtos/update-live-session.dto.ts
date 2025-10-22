import { IsBoolean, IsDateString, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

/**
 * Partial update for a live session (host-only).
 * Used if you later expose PATCH /workouts/live/sessions/:id (optional).
 */
export class UpdateLiveSessionDto {
  @IsOptional()
  @IsString()
  @Length(3, 120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /** Reschedule if still scheduled; ignored once active/ended */
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsUUID()
  workoutPlanId?: string;

  @IsOptional()
  @IsBoolean()
  private?: boolean;
}
