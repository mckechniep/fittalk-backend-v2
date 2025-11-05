import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { OwnershipValidator } from '../../../common/services/ownership-validator.service';
import { MacroTarget } from '@prisma/client';
import { CreateMacroTargetDto } from '../dtos/create-macro-target.dto';
import { UpdateMacroTargetDto } from '../dtos/update-macro-target.dto';
import { MacroTargetResponseDto } from '../dtos/macro-target-response.dto';
import {
    InvalidFoodItemDataException,
    MacroTargetNotFoundException,
    MacroTargetNotOwnedException,
} from '../../../common/exceptions/nutrition.exceptions';
import { decimalToNumber } from '../types/prisma-to-dto.types';

/**
 * Macro Target Service
 *
 * Handles all business logic for user macro targets (calorie/macro goals).
 *
 * Responsibilities:
 * - CRUD operations for macro targets
 * - Ownership validation
 * - Active target retrieval (time-based)
 * - Macro target history
 * - Soft-delete support
 *
 * Design principles:
 * - Single Responsibility: Only manages macro targets
 * - Time-based filtering for active targets
 * - Proper error handling and logging
 * - Centralized ownership validation
 */
@Injectable()
export class MacroTargetService {
    private readonly logger = new Logger(MacroTargetService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly ownershipValidator: OwnershipValidator,
    ) {}

    /**
     * Create a new macro target
     *
     * @param userId - ID of the user
     * @param dto - Macro target creation data
     * @returns Promise resolving to the created macro target DTO
     * @throws InvalidFoodItemDataException if no macro values provided
     * @throws InternalServerErrorException if database operation fails
     */
    async createMacroTarget(userId: string, dto: CreateMacroTargetDto): Promise<MacroTargetResponseDto> {
        this.logger.log(`Creating macro target for user ${userId}`);

        try {
            // Validate at least one macro is provided
            if (!dto.calories && !dto.proteinG && !dto.carbsG && !dto.fatsG) {
                throw new InvalidFoodItemDataException(
                    'At least one macro value (calories, protein, carbs, or fats) must be provided'
                );
            }

            const macroTarget = await this.prisma.macroTarget.create({
                data: {
                    userId,
                    calories: dto.calories,
                    proteinG: dto.proteinG,
                    carbsG: dto.carbsG,
                    fatsG: dto.fatsG,
                    startsOn: dto.startsOn ? new Date(dto.startsOn) : new Date(),
                    endsOn: dto.endsOn ? new Date(dto.endsOn) : null,
                },
            });

            this.logger.log(`Successfully created macro target ${macroTarget.id}`);
            return this.toMacroTargetDto(macroTarget);
        } catch (error) {
            if (error instanceof InvalidFoodItemDataException) {
                throw error;
            }

            this.logger.error(`Failed to create macro target: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to create macro target');
        }
    }

    /**
     * Get user's current active macro target
     *
     * @param userId - ID of the user
     * @returns Promise resolving to the current active macro target DTO
     * @throws MacroTargetNotFoundException if no active target found
     * @throws InternalServerErrorException if database operation fails
     */
    async getCurrentMacroTarget(userId: string): Promise<MacroTargetResponseDto> {
        try {
            const now = new Date();

            const macroTarget = await this.prisma.macroTarget.findFirst({
                where: {
                    userId,
                    deletedAt: null,
                    startsOn: { lte: now },
                    OR: [
                        { endsOn: null },
                        { endsOn: { gte: now } },
                    ],
                },
                orderBy: { startsOn: 'desc' },
            });

            if (!macroTarget) {
                this.logger.warn(`No active macro target found for user ${userId}`);
                throw new MacroTargetNotFoundException();
            }

            return this.toMacroTargetDto(macroTarget);
        } catch (error) {
            if (error instanceof MacroTargetNotFoundException) {
                throw error;
            }

            this.logger.error(`Failed to get current macro target: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to retrieve macro target');
        }
    }

    /**
     * Get all user's macro targets (history)
     *
     * @param userId - ID of the user
     * @returns Promise resolving to array of macro target DTOs
     * @throws InternalServerErrorException if database operation fails
     */
    async getUserMacroTargets(userId: string): Promise<MacroTargetResponseDto[]> {
        try {
            const targets = await this.prisma.macroTarget.findMany({
                where: {
                    userId,
                    deletedAt: null,
                },
                orderBy: { startsOn: 'desc' },
            });

            return targets.map(target => this.toMacroTargetDto(target));
        } catch (error) {
            this.logger.error(`Failed to get macro targets: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to retrieve macro targets');
        }
    }

    /**
     * Update a macro target
     *
     * @param id - UUID of the macro target
     * @param userId - ID of the user (for ownership verification)
     * @param dto - Partial macro target data for update
     * @returns Promise resolving to the updated macro target DTO
     * @throws MacroTargetNotFoundException if target not found
     * @throws MacroTargetNotOwnedException if user doesn't own the target
     * @throws InternalServerErrorException if database operation fails
     */
    async updateMacroTarget(id: string, userId: string, dto: UpdateMacroTargetDto): Promise<MacroTargetResponseDto> {
        try {
            const macroTarget = await this.prisma.macroTarget.findFirst({
                where: {
                    id,
                    deletedAt: null,
                },
            });

            // Validate ownership using centralized validator
            this.ownershipValidator.validateOwnershipWithCustomExceptions(
                macroTarget,
                userId,
                'MacroTarget',
                id,
                new MacroTargetNotFoundException(id),
                new MacroTargetNotOwnedException(id, userId)
            );

            this.logger.log(`Updating macro target ${id}`);

            const updated = await this.prisma.macroTarget.update({
                where: { id },
                data: {
                    ...(dto.calories !== undefined && { calories: dto.calories }),
                    ...(dto.proteinG !== undefined && { proteinG: dto.proteinG }),
                    ...(dto.carbsG !== undefined && { carbsG: dto.carbsG }),
                    ...(dto.fatsG !== undefined && { fatsG: dto.fatsG }),
                    ...(dto.startsOn !== undefined && { startsOn: new Date(dto.startsOn) }),
                    ...(dto.endsOn !== undefined && { endsOn: dto.endsOn ? new Date(dto.endsOn) : null }),
                },
            });

            return this.toMacroTargetDto(updated);
        } catch (error) {
            if (error instanceof MacroTargetNotFoundException || error instanceof MacroTargetNotOwnedException) {
                throw error;
            }

            this.logger.error(`Failed to update macro target ${id}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to update macro target');
        }
    }

    /**
     * Soft delete a macro target
     *
     * @param id - UUID of the macro target
     * @param userId - ID of the user (for ownership verification)
     * @throws MacroTargetNotFoundException if target not found
     * @throws MacroTargetNotOwnedException if user doesn't own the target
     * @throws InternalServerErrorException if database operation fails
     */
    async deleteMacroTarget(id: string, userId: string): Promise<void> {
        try {
            const macroTarget = await this.prisma.macroTarget.findFirst({
                where: {
                    id,
                    deletedAt: null,
                },
            });

            // Validate ownership using centralized validator
            this.ownershipValidator.validateOwnershipWithCustomExceptions(
                macroTarget,
                userId,
                'MacroTarget',
                id,
                new MacroTargetNotFoundException(id),
                new MacroTargetNotOwnedException(id, userId)
            );

            this.logger.log(`Soft deleting macro target ${id}`);

            await this.prisma.macroTarget.update({
                where: { id },
                data: { deletedAt: new Date() },
            });
        } catch (error) {
            if (error instanceof MacroTargetNotFoundException || error instanceof MacroTargetNotOwnedException) {
                throw error;
            }

            this.logger.error(`Failed to delete macro target ${id}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to delete macro target');
        }
    }

    // ==================== PRIVATE HELPER METHODS ====================

    /**
     * Convert Prisma MacroTarget to response DTO with Decimal to number conversion
     */
    private toMacroTargetDto(target: MacroTarget): MacroTargetResponseDto {
        return {
            id: target.id,
            userId: target.userId,
            calories: target.calories,
            proteinG: target.proteinG ? decimalToNumber(target.proteinG) : null,
            carbsG: target.carbsG ? decimalToNumber(target.carbsG) : null,
            fatsG: target.fatsG ? decimalToNumber(target.fatsG) : null,
            startsOn: target.startsOn,
            endsOn: target.endsOn,
            createdAt: target.createdAt,
            updatedAt: target.updatedAt,
        };
    }
}
