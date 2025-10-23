import { Expose, Type } from 'class-transformer';

/**
 * Represents the current state of an active workout session.
 * Used for real-time synchronization across devices.
 */
export class SessionStateSnapshotDto {
  @Expose()
  sessionId!: string;

  @Expose()
  status!: 'idle' | 'exercising' | 'resting' | 'paused' | 'completed';

  @Expose()
  currentExerciseId?: string | null;

  @Expose()
  currentExerciseIndex?: number;

  @Expose()
  currentSetNumber?: number;

  @Expose()
  totalSetsCompleted?: number;

  @Expose()
  restTimerStartedAt?: number | null; // Unix timestamp in ms

  @Expose()
  restDurationMs?: number | null;

  @Expose()
  @Type(() => Date)
  lastActivityAt!: Date;

  @Expose()
  metadata?: Record<string, any>;
}
