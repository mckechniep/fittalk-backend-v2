import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { Role } from '../../common/enums/role.enum';
import {
  CreateTicketDto,
  UpdateTicketDto,
  AddMessageDto,
  ListTicketsQueryDto,
  TicketResponseDto,
  DetailedTicketResponseDto,
  PaginatedTicketsResponseDto,
  TicketStatus,
} from './dtos';
import { plainToInstance } from 'class-transformer';

/**
 * Support Service
 *
 * Handles support ticket operations:
 * - Ticket creation (users)
 * - Ticket management (support staff)
 * - Message threads
 * - Activity tracking
 */
@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new support ticket (user-facing)
   */
  async createTicket(userId: string, dto: CreateTicketDto): Promise<DetailedTicketResponseDto> {
    this.logger.log(`User ${userId} creating ticket: ${dto.subject}`);

    const ticket = await this.prisma.supportTicket.create({
      data: {
        userId,
        subject: dto.subject,
        category: dto.category,
        messages: {
          create: {
            userId,
            message: dto.message,
            isInternal: false,
          },
        },
        activities: {
          create: {
            userId,
            action: 'TICKET_CREATED',
            details: {
              category: dto.category,
              subject: dto.subject,
            },
          },
        },
      },
      include: {
        user: {
          select: {
            email: true,
            profile: {
              select: {
                firstname: true,
                lastname: true,
              },
            },
          },
        },
        messages: {
          include: {
            user: {
              select: {
                email: true,
                role: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        activities: {
          include: {
            user: {
              select: {
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return plainToInstance(DetailedTicketResponseDto, ticket, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * List tickets (with role-based filtering)
   */
  async listTickets(
    currentUserId: string,
    userRole: Role,
    query: ListTicketsQueryDto,
  ): Promise<PaginatedTicketsResponseDto> {
    const { page = 1, limit = 20, status, category, priority, userId, assigneeId, unassignedOnly, sortBy = 'createdAt', sortOrder = 'desc' } = query;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.SupportTicketWhereInput = {};

    // Role-based filtering
    if (userRole === Role.USER) {
      // Users can only see their own tickets
      where.userId = currentUserId;
    } else if (userRole === Role.SUPPORT) {
      // Support can see all tickets or filter by user
      if (userId) {
        where.userId = userId;
      }
      // Support can filter by assignee
      if (assigneeId) {
        where.assigneeId = assigneeId;
      }
    } else if (userRole === Role.ADMIN) {
      // Admins can see all tickets with all filters
      if (userId) where.userId = userId;
      if (assigneeId) where.assigneeId = assigneeId;
    }

    // Common filters
    if (status) where.status = status;
    if (category) where.category = category;
    if (priority) where.priority = priority;
    if (unassignedOnly) where.assigneeId = null;

    // Build orderBy
    const orderBy: Prisma.SupportTicketOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    // Execute query
    const [tickets, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          user: {
            select: {
              email: true,
              profile: {
                select: {
                  firstname: true,
                  lastname: true,
                },
              },
            },
          },
          assignee: {
            select: {
              email: true,
            },
          },
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: {
              message: true,
              createdAt: true,
            },
          },
          _count: {
            select: {
              messages: true,
            },
          },
        },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    // Transform to DTO
    const ticketDtos = tickets.map((ticket) => {
      const dto = plainToInstance(TicketResponseDto, ticket, {
        excludeExtraneousValues: true,
      });
      dto.messageCount = (ticket._count as any).messages;
      dto.latestMessage = ticket.messages[0] || undefined;
      return dto;
    });

    return {
      tickets: ticketDtos,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Get detailed ticket information
   */
  async getTicket(currentUserId: string, userRole: Role, ticketId: string): Promise<DetailedTicketResponseDto> {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        user: {
          select: {
            email: true,
            profile: {
              select: {
                firstname: true,
                lastname: true,
              },
            },
          },
        },
        assignee: {
          select: {
            email: true,
          },
        },
        messages: {
          where: userRole === Role.USER ? { isInternal: false } : undefined,
          include: {
            user: {
              select: {
                email: true,
                role: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        activities: {
          include: {
            user: {
              select: {
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException({
        message: `Ticket with ID "${ticketId}" not found`,
        error: 'TicketNotFound',
        ticketId,
      });
    }

    // Authorization: Users can only view their own tickets
    if (userRole === Role.USER && ticket.userId !== currentUserId) {
      throw new ForbiddenException({
        message: 'You do not have permission to view this ticket',
        error: 'TicketAccessDenied',
      });
    }

    return plainToInstance(DetailedTicketResponseDto, ticket, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Update ticket (support/admin only)
   */
  async updateTicket(
    currentUserId: string,
    userRole: Role,
    ticketId: string,
    dto: UpdateTicketDto,
  ): Promise<TicketResponseDto> {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException({
        message: `Ticket with ID "${ticketId}" not found`,
        error: 'TicketNotFound',
        ticketId,
      });
    }

    this.logger.log(`${userRole} ${currentUserId} updating ticket ${ticketId}`);

    // Track what changed for activity log
    const changes: Record<string, any> = {};
    if (dto.assigneeId !== undefined) changes.assigneeId = dto.assigneeId;
    if (dto.priority !== undefined) changes.priority = dto.priority;
    if (dto.status !== undefined) changes.status = dto.status;
    if (dto.tags !== undefined) changes.tags = dto.tags;

    // Update ticket
    const updatedTicket = await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        ...dto,
        ...(dto.status === TicketStatus.RESOLVED && !ticket.resolvedAt ? { resolvedAt: new Date() } : {}),
        ...(dto.status === TicketStatus.CLOSED && !ticket.closedAt ? { closedAt: new Date() } : {}),
        activities: {
          create: {
            userId: currentUserId,
            action: 'TICKET_UPDATED',
            details: changes,
          },
        },
      },
      include: {
        user: {
          select: {
            email: true,
            profile: {
              select: {
                firstname: true,
                lastname: true,
              },
            },
          },
        },
        assignee: {
          select: {
            email: true,
          },
        },
      },
    });

    return plainToInstance(TicketResponseDto, updatedTicket, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Add message to ticket
   */
  async addMessage(
    currentUserId: string,
    userRole: Role,
    ticketId: string,
    dto: AddMessageDto,
  ): Promise<DetailedTicketResponseDto> {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException({
        message: `Ticket with ID "${ticketId}" not found`,
        error: 'TicketNotFound',
        ticketId,
      });
    }

    // Authorization: Users can only reply to their own tickets
    if (userRole === Role.USER && ticket.userId !== currentUserId) {
      throw new ForbiddenException({
        message: 'You do not have permission to reply to this ticket',
        error: 'TicketAccessDenied',
      });
    }

    // Users cannot create internal notes
    if (userRole === Role.USER && dto.isInternal) {
      throw new BadRequestException({
        message: 'Users cannot create internal notes',
        error: 'InternalNotesNotAllowed',
      });
    }

    this.logger.log(`User ${currentUserId} adding message to ticket ${ticketId}`);

    // Determine new status based on who replied
    let newStatus = ticket.status;
    if (userRole === Role.USER && ticket.status === TicketStatus.WAITING_FOR_USER) {
      newStatus = TicketStatus.WAITING_FOR_SUPPORT;
    } else if (userRole !== Role.USER && ticket.status === TicketStatus.WAITING_FOR_SUPPORT) {
      newStatus = TicketStatus.WAITING_FOR_USER;
    }

    const updatedTicket = await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: newStatus,
        messages: {
          create: {
            userId: currentUserId,
            message: dto.message,
            isInternal: dto.isInternal || false,
          },
        },
        activities: {
          create: {
            userId: currentUserId,
            action: dto.isInternal ? 'INTERNAL_NOTE_ADDED' : 'MESSAGE_ADDED',
            details: {
              isInternal: dto.isInternal,
            },
          },
        },
      },
      include: {
        user: {
          select: {
            email: true,
            profile: {
              select: {
                firstname: true,
                lastname: true,
              },
            },
          },
        },
        assignee: {
          select: {
            email: true,
          },
        },
        messages: {
          where: userRole === Role.USER ? { isInternal: false } : undefined,
          include: {
            user: {
              select: {
                email: true,
                role: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        activities: {
          include: {
            user: {
              select: {
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return plainToInstance(DetailedTicketResponseDto, updatedTicket, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Close ticket
   */
  async closeTicket(currentUserId: string, userRole: Role, ticketId: string): Promise<TicketResponseDto> {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException({
        message: `Ticket with ID "${ticketId}" not found`,
        error: 'TicketNotFound',
        ticketId,
      });
    }

    // Authorization: Users can only close their own tickets
    if (userRole === Role.USER && ticket.userId !== currentUserId) {
      throw new ForbiddenException({
        message: 'You do not have permission to close this ticket',
        error: 'TicketAccessDenied',
      });
    }

    if (ticket.status === TicketStatus.CLOSED) {
      throw new BadRequestException({
        message: 'Ticket is already closed',
        error: 'TicketAlreadyClosed',
      });
    }

    this.logger.log(`User ${currentUserId} closing ticket ${ticketId}`);

    const updatedTicket = await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: TicketStatus.CLOSED,
        closedAt: new Date(),
        activities: {
          create: {
            userId: currentUserId,
            action: 'TICKET_CLOSED',
            details: {},
          },
        },
      },
      include: {
        user: {
          select: {
            email: true,
            profile: {
              select: {
                firstname: true,
                lastname: true,
              },
            },
          },
        },
        assignee: {
          select: {
            email: true,
          },
        },
      },
    });

    return plainToInstance(TicketResponseDto, updatedTicket, {
      excludeExtraneousValues: true,
    });
  }
}
