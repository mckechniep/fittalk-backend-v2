import { Module, Global } from '@nestjs/common';
import { OwnershipValidator } from './ownership-validator.service';
import { ValidationService } from './validation.service';

/**
 * Common Services Module
 *
 * Provides shared utility services that are used across multiple feature modules.
 * Marked as @Global to avoid importing in every module.
 *
 * Services:
 * - OwnershipValidator: Centralized ownership validation
 * - ValidationService: Reusable validation logic (nutrition, dates, ranges)
 *
 * Future services to add:
 * - DtoTransformer: DTO conversion helpers
 * - BusinessRulesEngine: Shared business logic
 */
@Global()
@Module({
    providers: [OwnershipValidator, ValidationService],
    exports: [OwnershipValidator, ValidationService],
})
export class CommonServicesModule {}
