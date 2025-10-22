import { IsBoolean, IsDateString, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

/**
 * Create a live workout session.
 * - If `scheduledAt` is omitted -> session starts immediately (status=active).
 * - If provided -> session is created as scheduled.
 */
export class CreateLiveSessionDto {
  @IsString()
  @Length(3, 120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /** ISO 8601 (e.g., "2025-10-22T16:30:00.000Z") */
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  /** Optional linkage to a predefined workout plan/template */
  @IsOptional()
  @IsUUID()
  workoutPlanId?: string;

  /** Private sessions require membership to view */
  @IsOptional()
  @IsBoolean()
  private?: boolean;
}
