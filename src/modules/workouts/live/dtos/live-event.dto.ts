import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Keep payload flexible but validated. We cover the common event families your
 * app will emit; service/gateway can route/broadcast accordingly.
 */
export class LiveEventPayloadDto {
  /** Optional: link event to a specific exercise within the session */
  @IsOptional()
  @IsUUID()
  exerciseId?: string;

  /** For metric/update style events (e.g., HR, RPE, weight, reps) */
  @IsOptional()
  @IsNumber()
  value?: number;

  /** For rep-like metrics */
  @IsOptional()
  @IsInt()
  @Min(0)
  reps?: number;

  /** For weight/time cues, etc. */
  @IsOptional()
  @IsNumber()
  weight?: number;

  /** Human message (coach cue, chat text, short note) */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

export type LiveEventType =
  | 'session.started'
  | 'session.ended'
  | 'exercise.started'
  | 'exercise.ended'
  | 'coach.cue'
  | 'participant.update'
  | 'metric.update'
  | 'chat.message'
  | 'presence.update';

export class LiveEventDto {
  @IsString()
  @IsIn([
    'session.started',
    'session.ended',
    'exercise.started',
    'exercise.ended',
    'coach.cue',
    'participant.update',
    'metric.update',
    'chat.message',
    'presence.update',
  ])
  type!: LiveEventType;

  @IsOptional()
  @ValidateNested()
  @Type(() => LiveEventPayloadDto)
  payload?: LiveEventPayloadDto;

  /**
   * Optional client-generated correlation id for de-dupe across network paths
   * (mobile may send via WS and retry over HTTP on flaky networks).
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  correlationId?: string;
}
