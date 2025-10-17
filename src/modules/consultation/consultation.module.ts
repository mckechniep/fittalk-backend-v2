// consultation.module.ts
import { Module } from '@nestjs/common';
import { ConsultationController } from './consultation.controller';
import { AvailabilityController } from './availability.controller';
import { ConsultationService } from './consultation.service';
import { PrismaModule } from '../../prisma/prisma.module';

/**
 * Consultation Module
 * 
 * Encapsulates all consultation and availability functionality.
 * 
 * Controllers (split by resource):
 * - ConsultationController: Handles /consultation routes (onboarding flow, questions)
 * - AvailabilityController: Handles /availability routes (weekly schedule management)
 * 
 * Rationale for split:
 * - Different resources: Consultation happens during onboarding, availability is ongoing
 * - RESTful design: /consultation and /availability as top-level resources
 * - Independent usage: Workout scheduler only needs availability, not consultation
 * - Cleaner controllers: Each under 200 lines, focused responsibility
 * 
 * Service:
 * - ConsultationService: Shared business logic for both controllers
 * - Could split into ConsultationService + AvailabilityService later if needed
 * - For now: Kept together since they share validation logic and database access
 * 
 * Dependencies:
 * - PrismaModule: Database access (provides PrismaService)
 * - (Future) EventEmitterModule: For consultation.completed events
 * - (Future) BullModule: For async AI plan generation jobs
 * 
 * Exports:
 * - ConsultationService: Available to other modules (e.g., AI module needs consultation data)
 * 
 * Design decisions:
 * - Service is exported: Other modules may need consultation/availability data
 * - Controllers are NOT exported: HTTP routes are module-internal
 * - PrismaModule imported: Proper module-based dependency injection
 * - No providers bloat: Only necessary services registered
 */
@Module({
  imports: [
    PrismaModule, // Provides PrismaService for database access
  ],
  controllers: [
    ConsultationController, // /consultation routes
    AvailabilityController, // /availability routes
  ],
  providers: [
    ConsultationService, // Shared business logic
  ],
  exports: [
    ConsultationService, // Available to other modules (AI, Profile, Analytics)
  ],
})
export class ConsultationModule {}
