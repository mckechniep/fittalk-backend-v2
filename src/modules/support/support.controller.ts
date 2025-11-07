import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SupportService } from './support.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SanitizationPipe } from '../../common/pipes/sanitization.pipe';
import { AuditLoggingInterceptor } from '../../common/interceptors/audit-logging.interceptor';
import { AuditEntity } from '../../common/decorators/audit-entity.decorator';
import {
  SupportListTickets,
  SupportGetTicket,
  SupportCreateTicket,
  SupportUpdateTicket,
  SupportAddMessage,
  SupportCloseTicket,
} from '../../common/guards/throttler/throttler.decorators';
import {
  CreateTicketDto,
  UpdateTicketDto,
  AddMessageDto,
  ListTicketsQueryDto,
  TicketResponseDto,
  DetailedTicketResponseDto,
  PaginatedTicketsResponseDto,
} from './dtos';

/**
 * Support Controller
 *
 * Provides endpoints for support ticket management.
 *
 * Access Levels:
 * - USER: Can create tickets, view own tickets, add messages to own tickets
 * - SUPPORT: Can view all tickets, respond to tickets, update ticket status
 * - ADMIN: Full access to all operations
 *
 * Features:
 * - Ticket creation (users)
 * - Ticket management (support/admin)
 * - Message threads
 * - Activity tracking
 * - Status transitions
 */
@ApiTags('Support')
@ApiBearerAuth()
@Controller('support/tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditLoggingInterceptor)
@UsePipes(new SanitizationPipe())
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  /**
   * POST /support/tickets
   *
   * Create a new support ticket.
   *
   * Available to: All authenticated users
   *
   * Request body:
   * - subject: Ticket title
   * - category: Issue category (TECHNICAL_ISSUE, ACCOUNT_ISSUE, etc.)
   * - message: Initial description of the issue
   *
   * Response:
   * - Created ticket with initial message
   * - Auto-assigned ticket number
   * - Status: OPEN
   * - Priority: MEDIUM (default)
   *
   * Use cases:
   * - Report bugs
   * - Request features
   * - Get help with account issues
   * - General inquiries
   */
  @Post()
  @SupportCreateTicket()
  @AuditEntity('SupportTicket')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new support ticket' })
  @ApiResponse({
    status: 201,
    description: 'Ticket created successfully',
    type: DetailedTicketResponseDto,
  })
  async createTicket(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTicketDto,
  ): Promise<DetailedTicketResponseDto> {
    return this.supportService.createTicket(userId, dto);
  }

  /**
   * GET /support/tickets
   *
   * List tickets with filters.
   *
   * Access control:
   * - USER: Can only see own tickets
   * - SUPPORT/ADMIN: Can see all tickets
   *
   * Query parameters:
   * - page, limit: Pagination
   * - status: Filter by status
   * - category: Filter by category
   * - priority: Filter by priority
   * - userId: Filter by user (support/admin only)
   * - assigneeId: Filter by assignee (support/admin only)
   * - unassignedOnly: Show unassigned tickets
   * - sortBy, sortOrder: Sorting
   *
   * Use cases:
   * - Users viewing their support history
   * - Support staff viewing queue
   * - Admins monitoring tickets
   */
  @Get()
  @SupportListTickets()
  @ApiOperation({ summary: 'List support tickets' })
  @ApiResponse({
    status: 200,
    description: 'Tickets retrieved successfully',
    type: PaginatedTicketsResponseDto,
  })
  async listTickets(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: Role,
    @Query() query: ListTicketsQueryDto,
  ): Promise<PaginatedTicketsResponseDto> {
    return this.supportService.listTickets(userId, userRole, query);
  }

  /**
   * GET /support/tickets/:id
   *
   * Get detailed ticket information.
   *
   * Access control:
   * - USER: Can only view own tickets
   * - SUPPORT/ADMIN: Can view any ticket
   *
   * Response includes:
   * - Ticket details
   * - Full message thread (excluding internal notes for users)
   * - Activity log
   * - User and assignee information
   *
   * Use cases:
   * - View ticket conversation
   * - Check ticket status
   * - Review support history
   */
  @Get(':id')
  @SupportGetTicket()
  @ApiOperation({ summary: 'Get detailed ticket information' })
  @ApiResponse({
    status: 200,
    description: 'Ticket retrieved successfully',
    type: DetailedTicketResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Access denied (not your ticket)' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async getTicket(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: Role,
    @Param('id', ParseUUIDPipe) ticketId: string,
  ): Promise<DetailedTicketResponseDto> {
    return this.supportService.getTicket(userId, userRole, ticketId);
  }

  /**
   * PATCH /support/tickets/:id
   *
   * Update ticket properties (support/admin only).
   *
   * Available to: SUPPORT, ADMIN
   *
   * Request body (all optional):
   * - assigneeId: Assign to support staff
   * - priority: Update priority level
   * - status: Change ticket status
   * - tags: Add tags for categorization
   *
   * Status transitions:
   * - OPEN → IN_PROGRESS (when support starts working)
   * - IN_PROGRESS → WAITING_FOR_USER (need user response)
   * - WAITING_FOR_USER → WAITING_FOR_SUPPORT (user responded)
   * - * → RESOLVED (issue fixed)
   * - RESOLVED → CLOSED (confirmed by user)
   *
   * Use cases:
   * - Assign tickets to support staff
   * - Triage and prioritize
   * - Update status as work progresses
   * - Organize with tags
   */
  @Patch(':id')
  @Roles(Role.SUPPORT, Role.ADMIN)
  @SupportUpdateTicket()
  @AuditEntity('SupportTicket')
  @ApiOperation({ summary: 'Update ticket properties (support/admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Ticket updated successfully',
    type: TicketResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async updateTicket(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: Role,
    @Param('id', ParseUUIDPipe) ticketId: string,
    @Body() dto: UpdateTicketDto,
  ): Promise<TicketResponseDto> {
    return this.supportService.updateTicket(userId, userRole, ticketId, dto);
  }

  /**
   * POST /support/tickets/:id/messages
   *
   * Add message to ticket.
   *
   * Access control:
   * - USER: Can reply to own tickets (no internal notes)
   * - SUPPORT/ADMIN: Can reply to any ticket (can create internal notes)
   *
   * Request body:
   * - message: Message content
   * - isInternal: Mark as internal note (support/admin only)
   *
   * Behavior:
   * - Auto-updates ticket status based on who replied
   * - Creates activity log entry
   * - Preserves message thread order
   *
   * Internal notes:
   * - Visible only to support/admin
   * - Used for staff communication
   * - Not visible to ticket creator
   *
   * Use cases:
   * - User providing additional information
   * - Support staff responding to user
   * - Internal discussion about resolution
   */
  @Post(':id/messages')
  @SupportAddMessage()
  @AuditEntity('TicketMessage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add message to ticket' })
  @ApiResponse({
    status: 201,
    description: 'Message added successfully',
    type: DetailedTicketResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Access denied (not your ticket or internal notes not allowed)' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async addMessage(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: Role,
    @Param('id', ParseUUIDPipe) ticketId: string,
    @Body() dto: AddMessageDto,
  ): Promise<DetailedTicketResponseDto> {
    return this.supportService.addMessage(userId, userRole, ticketId, dto);
  }

  /**
   * POST /support/tickets/:id/close
   *
   * Close ticket.
   *
   * Access control:
   * - USER: Can close own tickets
   * - SUPPORT/ADMIN: Can close any ticket
   *
   * Effects:
   * - Sets status to CLOSED
   * - Records close timestamp
   * - Creates activity log entry
   * - Prevents further updates (ticket is final)
   *
   * When to close:
   * - Issue resolved and confirmed
   * - User no longer needs help
   * - Duplicate ticket
   *
   * Note: Closed tickets cannot be reopened (create new ticket instead)
   */
  @Post(':id/close')
  @SupportCloseTicket()
  @AuditEntity('SupportTicket')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close ticket' })
  @ApiResponse({
    status: 200,
    description: 'Ticket closed successfully',
    type: TicketResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Ticket already closed' })
  @ApiResponse({ status: 403, description: 'Access denied (not your ticket)' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async closeTicket(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: Role,
    @Param('id', ParseUUIDPipe) ticketId: string,
  ): Promise<TicketResponseDto> {
    return this.supportService.closeTicket(userId, userRole, ticketId);
  }
}
