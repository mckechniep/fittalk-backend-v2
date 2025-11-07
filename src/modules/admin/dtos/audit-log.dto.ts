import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, Min, Max, IsDateString } from 'class-validator';
import { Transform, Type, Expose } from 'class-transformer';

/**
 * DTO for querying audit logs
 */
export class AuditLogQueryDto {
  @ApiPropertyOptional({ description: 'Page number', example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', example: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({ description: 'Filter by user ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Filter by actor ID (admin who performed action)' })
  @IsOptional()
  @IsString()
  actorId?: string;

  @ApiPropertyOptional({ description: 'Filter by action type (e.g., CREATE, UPDATE, DELETE)' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ description: 'Filter by entity type (e.g., User, WorkoutLog)' })
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional({ description: 'Filter by entity ID' })
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiPropertyOptional({ description: 'Start date filter (ISO 8601)', example: '2025-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date filter (ISO 8601)', example: '2025-12-31T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

/**
 * DTO for audit log response
 */
export class AuditLogResponseDto {
  @ApiProperty({ description: 'Audit log ID' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'User affected by action', nullable: true })
  @Expose()
  userId: string | null;

  @ApiProperty({ description: 'Admin/actor who performed action', nullable: true })
  @Expose()
  actorId: string | null;

  @ApiProperty({ description: 'Action performed', example: 'UPDATE' })
  @Expose()
  action: string;

  @ApiProperty({ description: 'Entity type', example: 'User' })
  @Expose()
  entityType: string;

  @ApiProperty({ description: 'Entity ID', nullable: true })
  @Expose()
  entityId: string | null;

  @ApiProperty({ description: 'Previous values (JSON)', nullable: true })
  @Expose()
  prevValues: any;

  @ApiProperty({ description: 'New values (JSON)', nullable: true })
  @Expose()
  newValues: any;

  @ApiProperty({ description: 'IP address', nullable: true })
  @Expose()
  ip: string | null;

  @ApiProperty({ description: 'User agent', nullable: true })
  @Expose()
  userAgent: string | null;

  @ApiProperty({ description: 'Timestamp' })
  @Expose()
  createdAt: Date;
}

/**
 * DTO for paginated audit log response
 */
export class PaginatedAuditLogsResponseDto {
  @ApiProperty({ description: 'Audit logs', type: [AuditLogResponseDto] })
  @Expose()
  logs: AuditLogResponseDto[];

  @ApiProperty({ description: 'Pagination metadata' })
  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
