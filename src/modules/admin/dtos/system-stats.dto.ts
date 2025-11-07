import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/**
 * DTO for system statistics response
 */
export class SystemStatsResponseDto {
  @ApiProperty({ description: 'User statistics' })
  @Expose()
  users: {
    total: number;
    active: number;
    suspended: number;
    newThisMonth: number;
    byRole: Record<string, number>;
  };

  @ApiProperty({ description: 'Activity statistics' })
  @Expose()
  activity: {
    totalWorkoutLogs: number;
    totalMealLogs: number;
    totalGoals: number;
    totalConsultations: number;
    activeSessionsCount: number;
  };

  @ApiProperty({ description: 'Support statistics' })
  @Expose()
  support: {
    totalTickets: number;
    openTickets: number;
    resolvedTickets: number;
    avgResolutionTimeHours: number | null;
  };

  @ApiProperty({ description: 'System health' })
  @Expose()
  system: {
    databaseStatus: 'healthy' | 'degraded' | 'down';
    redisStatus: 'healthy' | 'degraded' | 'down';
    uptimeSeconds: number;
  };
}
