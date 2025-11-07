import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsUUID,
  IsBoolean,
  IsDateString,
} from 'class-validator';
import { Transform, Type, Expose } from 'class-transformer';
import { Role } from '../../../common/enums/role.enum';

/**
 * DTO for listing users with pagination and filters
 */
export class ListUsersQueryDto {
  @ApiPropertyOptional({ description: 'Page number (1-indexed)', example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by email (partial match)', example: 'john@example.com' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ description: 'Filter by role', enum: Role, example: Role.USER })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ description: 'Include suspended users only', example: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  suspendedOnly?: boolean;

  @ApiPropertyOptional({ description: 'Sort by field', example: 'createdAt' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({ description: 'Sort order', enum: ['asc', 'desc'], example: 'desc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';
}

/**
 * DTO for suspending a user
 */
export class SuspendUserDto {
  @ApiProperty({ description: 'Reason for suspension', example: 'Violation of terms of service' })
  @IsString()
  reason: string;
}

/**
 * DTO for updating user role
 */
export class UpdateUserRoleDto {
  @ApiProperty({ description: 'New role for user', enum: Role, example: Role.SUPPORT })
  @IsEnum(Role)
  role: Role;
}

/**
 * DTO for admin user details response
 */
export class AdminUserResponseDto {
  @ApiProperty({ description: 'User ID', example: '123e4567-e89b-12d3-a456-426614174000' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'Email address', example: 'user@example.com' })
  @Expose()
  email: string;

  @ApiProperty({ description: 'Phone number', example: '+1234567890', nullable: true })
  @Expose()
  phone: string | null;

  @ApiProperty({ description: 'User role', enum: Role, example: Role.USER })
  @Expose()
  role: Role;

  @ApiProperty({ description: 'Is user suspended', example: false })
  @Expose()
  @Transform(({ obj }) => !!obj.suspendedAt)
  isSuspended: boolean;

  @ApiProperty({ description: 'Suspension reason', example: 'Terms violation', nullable: true })
  @Expose()
  suspendedReason: string | null;

  @ApiProperty({ description: 'Suspended by admin ID', nullable: true })
  @Expose()
  suspendedBy: string | null;

  @ApiProperty({ description: 'Suspension timestamp', nullable: true })
  @Expose()
  suspendedAt: Date | null;

  @ApiProperty({ description: 'Has completed profile', example: true })
  @Expose()
  @Transform(({ obj }) => !!obj.profile)
  hasProfile: boolean;

  @ApiProperty({ description: 'Account creation date' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ description: 'Last update date' })
  @Expose()
  updatedAt: Date;

  @ApiProperty({ description: 'Profile information', required: false })
  @Expose()
  profile?: {
    firstname: string;
    lastname: string;
    sex: string | null;
    experienceLevel: string | null;
  };

  @ApiProperty({ description: 'Activity statistics' })
  @Expose()
  stats?: {
    workoutLogsCount: number;
    goalsCount: number;
    consultationsCount: number;
    lastActiveAt: Date | null;
  };
}

/**
 * DTO for paginated user list response
 */
export class PaginatedUsersResponseDto {
  @ApiProperty({ description: 'List of users', type: [AdminUserResponseDto] })
  @Expose()
  users: AdminUserResponseDto[];

  @ApiProperty({ description: 'Pagination metadata' })
  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
