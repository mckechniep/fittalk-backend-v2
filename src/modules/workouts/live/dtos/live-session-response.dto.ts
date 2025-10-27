// live/dtos/live-session-response.dto.ts
import { Expose } from 'class-transformer';

/**
 * Response DTO for live workout session.
 */
export class LiveSessionResponseDto {
  @Expose()
  id: string;

  @Expose()
  userId: string;

  @Expose()
  planId: string | null;

  @Expose()
  dayId: string | null;

  @Expose()
  startedAt: Date;

  @Expose()
  endedAt: Date | null;

  @Expose()
  stateJson: any;

  @Expose()
  wsConnectionId: string | null;

  @Expose()
  heartbeatAt: Date | null;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;
}
