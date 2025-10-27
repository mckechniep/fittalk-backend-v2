import { Module } from '@nestjs/common';
import { ProgramsController } from './programs.controller';
import { ProgramsService } from './programs.service';
import { PrismaModule } from '../../prisma/prisma.module';

/**
 * Programs Module
 * 
 * Encapsulates all workout program/plan functionality.
 * 
 * Controllers:
 * - ProgramsController: Handles /programs routes (CRUD for programs, days, items)
 * 
 * Services:
 * - ProgramsService: Business logic for program management, cloning, nested resources
 * 
 * Dependencies:
 * - PrismaModule: Database access (provides PrismaService)
 * 
 * Exports:
 * - ProgramsService: Available to other modules (e.g., Goals module for linking, 
 *   Scheduler for workout scheduling, Analytics for progress tracking)
 * 
 * Design decisions:
 * - Service is exported: Other modules need program data
 * - Controller is NOT exported: HTTP routes are module-internal
 * - Complex module: Handles three-level hierarchy (Programs → Days → Items)
 */
@Module({
  imports: [
    PrismaModule, // Provides PrismaService for database access
  ],
  controllers: [
    ProgramsController, // /programs routes
  ],
  providers: [
    ProgramsService, // Business logic
  ],
  exports: [
    ProgramsService, // Available to other modules
  ],
})
export class ProgramsModule {}