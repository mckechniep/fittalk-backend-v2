import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaModule } from '../../prisma/prisma.module';

/**
 * Admin Module
 *
 * Provides administrative functionality for system management.
 *
 * Features:
 * - User management (suspend, delete, role changes)
 * - System statistics and monitoring
 * - Audit log access
 *
 * Security:
 * - All endpoints require ADMIN role
 * - All mutations logged via AuditLoggingInterceptor
 * - Rate limiting applied per endpoint
 */
@Module({
  imports: [PrismaModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
