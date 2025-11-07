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
  IsArray,
  ArrayMaxSize,
} from 'class-validator';
import { Transform, Type, Expose } from 'class-transformer';

/**
 * Ticket enums (mirroring Prisma schema)
 */
export enum TicketCategory {
  TECHNICAL_ISSUE = 'TECHNICAL_ISSUE',
  ACCOUNT_ISSUE = 'ACCOUNT_ISSUE',
  BILLING = 'BILLING',
  FEATURE_REQUEST = 'FEATURE_REQUEST',
  BUG_REPORT = 'BUG_REPORT',
  GENERAL_INQUIRY = 'GENERAL_INQUIRY',
  OTHER = 'OTHER',
}

export enum TicketPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum TicketStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  WAITING_FOR_USER = 'WAITING_FOR_USER',
  WAITING_FOR_SUPPORT = 'WAITING_FOR_SUPPORT',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

/**
 * DTO for creating a support ticket (user-facing)
 */
export class CreateTicketDto {
  @ApiProperty({ description: 'Subject/title of the ticket', example: 'Unable to log workouts' })
  @IsString()
  subject: string;

  @ApiProperty({ description: 'Category of issue', enum: TicketCategory })
  @IsEnum(TicketCategory)
  category: TicketCategory;

  @ApiProperty({ description: 'Initial message/description', example: 'When I try to log a workout, I get an error...' })
  @IsString()
  message: string;
}

/**
 * DTO for updating ticket (admin/support)
 */
export class UpdateTicketDto {
  @ApiPropertyOptional({ description: 'Assign ticket to support staff', example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({ description: 'Update priority', enum: TicketPriority })
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @ApiPropertyOptional({ description: 'Update status', enum: TicketStatus })
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ApiPropertyOptional({ description: 'Add tags', type: [String], example: ['login-issue', 'ios'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  tags?: string[];
}

/**
 * DTO for adding message to ticket
 */
export class AddMessageDto {
  @ApiProperty({ description: 'Message content', example: 'Thank you for contacting support...' })
  @IsString()
  message: string;

  @ApiPropertyOptional({
    description: 'Is this an internal note (not visible to user)?',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isInternal?: boolean = false;
}

/**
 * DTO for listing tickets with filters
 */
export class ListTicketsQueryDto {
  @ApiPropertyOptional({ description: 'Page number', example: 1, minimum: 1 })
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

  @ApiPropertyOptional({ description: 'Filter by status', enum: TicketStatus })
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ApiPropertyOptional({ description: 'Filter by category', enum: TicketCategory })
  @IsOptional()
  @IsEnum(TicketCategory)
  category?: TicketCategory;

  @ApiPropertyOptional({ description: 'Filter by priority', enum: TicketPriority })
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @ApiPropertyOptional({ description: 'Filter by user ID (for admin/support)' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Filter by assignee ID (for admin/support)' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({ description: 'Show only unassigned tickets', example: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unassignedOnly?: boolean;

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
 * DTO for ticket response
 */
export class TicketResponseDto {
  @ApiProperty({ description: 'Ticket ID' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'Ticket number (auto-incrementing)', example: 1234 })
  @Expose()
  ticketNumber: number;

  @ApiProperty({ description: 'User who created ticket' })
  @Expose()
  userId: string;

  @ApiProperty({ description: 'Assigned support staff ID', nullable: true })
  @Expose()
  assigneeId: string | null;

  @ApiProperty({ description: 'Subject/title' })
  @Expose()
  subject: string;

  @ApiProperty({ description: 'Category', enum: TicketCategory })
  @Expose()
  category: TicketCategory;

  @ApiProperty({ description: 'Priority', enum: TicketPriority })
  @Expose()
  priority: TicketPriority;

  @ApiProperty({ description: 'Status', enum: TicketStatus })
  @Expose()
  status: TicketStatus;

  @ApiProperty({ description: 'Tags', type: [String] })
  @Expose()
  tags: string[];

  @ApiProperty({ description: 'Resolved timestamp', nullable: true })
  @Expose()
  resolvedAt: Date | null;

  @ApiProperty({ description: 'Closed timestamp', nullable: true })
  @Expose()
  closedAt: Date | null;

  @ApiProperty({ description: 'Creation timestamp' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  @Expose()
  updatedAt: Date;

  @ApiProperty({ description: 'User details', required: false })
  @Expose()
  user?: {
    email: string;
    profile?: {
      firstname: string;
      lastname: string;
    };
  };

  @ApiProperty({ description: 'Assignee details', required: false })
  @Expose()
  assignee?: {
    email: string;
  };

  @ApiProperty({ description: 'Message count', required: false })
  @Expose()
  messageCount?: number;

  @ApiProperty({ description: 'Latest message', required: false })
  @Expose()
  latestMessage?: {
    message: string;
    createdAt: Date;
  };
}

/**
 * DTO for ticket message response
 */
export class TicketMessageResponseDto {
  @ApiProperty({ description: 'Message ID' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'Ticket ID' })
  @Expose()
  ticketId: string;

  @ApiProperty({ description: 'User who sent message' })
  @Expose()
  userId: string;

  @ApiProperty({ description: 'Message content' })
  @Expose()
  message: string;

  @ApiProperty({ description: 'Is internal note?', example: false })
  @Expose()
  isInternal: boolean;

  @ApiProperty({ description: 'Creation timestamp' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ description: 'User details', required: false })
  @Expose()
  user?: {
    email: string;
    role: string;
  };
}

/**
 * DTO for detailed ticket response (with messages)
 */
export class DetailedTicketResponseDto extends TicketResponseDto {
  @ApiProperty({ description: 'All messages', type: [TicketMessageResponseDto] })
  @Expose()
  messages: TicketMessageResponseDto[];

  @ApiProperty({ description: 'Activity log (status changes, assignments, etc.)' })
  @Expose()
  activities?: Array<{
    id: string;
    action: string;
    details: any;
    createdAt: Date;
    user?: {
      email: string;
    };
  }>;
}

/**
 * DTO for paginated tickets response
 */
export class PaginatedTicketsResponseDto {
  @ApiProperty({ description: 'List of tickets', type: [TicketResponseDto] })
  @Expose()
  tickets: TicketResponseDto[];

  @ApiProperty({ description: 'Pagination metadata' })
  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
