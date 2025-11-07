import { Module } from '@nestjs/common';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { PrismaModule } from '../../prisma/prisma.module';

/**
 * Support Module
 *
 * Provides support ticket functionality for customer service.
 *
 * Features:
 * - Ticket creation (users)
 * - Ticket management (support staff)
 * - Message threads with internal notes
 * - Activity tracking
 * - Status workflow management
 *
 * Access Levels:
 * - USER: Create and view own tickets
 * - SUPPORT: Manage all tickets
 * - ADMIN: Full access
 */
@Module({
  imports: [PrismaModule],
  controllers: [SupportController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
