import { Module } from '@nestjs/common';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';
import { PrismaModule } from '../../prisma/prisma.module';

/**
 * Goals Module
 * 
 * Encapsulates all fitness goal management functionality.
 * 
 * Controllers:
 * - GoalsController: Handles /goals routes (CRUD operations, status updates)
 * 
 * Services:
 * - GoalsService: Business logic for goal management
 * 
 * Dependencies:
 * - PrismaModule: Database access (provides PrismaService)
 * 
 * Exports:
 * - GoalsService: Available to other modules (e.g., Programs module for goal-plan linking)
 * 
 * Design decisions:
 * - Service is exported: Other modules may need goal data for analytics, reporting
 * - Controller is NOT exported: HTTP routes are module-internal
 * - Simple module: No complex dependencies, straightforward CRUD
 */
@Module({
  imports: [
    PrismaModule, // Provides PrismaService for database access
  ],
  controllers: [
    GoalsController, // /goals routes
  ],
  providers: [
    GoalsService, // Business logic
  ],
  exports: [
    GoalsService, // Available to other modules
  ],
})
export class GoalsModule {}