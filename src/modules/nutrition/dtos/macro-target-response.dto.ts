// dtos/macro-target-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';

/**
 * Response DTO for macro target
 */
export class MacroTargetResponseDto {
    @ApiProperty({ description: 'Unique identifier', example: 'uuid' })
    @Expose()
    id: string;

    @ApiProperty({ description: 'User ID', example: 'uuid' })
    @Expose()
    userId: string;

    @ApiProperty({
        description: 'Target calories per day',
        example: 2200,
        required: false
    })
    @Expose()
    calories: number | null;

    @ApiProperty({
        description: 'Target protein in grams',
        example: 180,
        required: false
    })
    @Expose()
    @Transform(({ value }) => value === null ? null : (typeof value === 'object' && value?.toNumber ? value.toNumber() : Number(value)))
    proteinG: number | null;

    @ApiProperty({
        description: 'Target carbohydrates in grams',
        example: 250,
        required: false
    })
    @Expose()
    @Transform(({ value }) => value === null ? null : (typeof value === 'object' && value?.toNumber ? value.toNumber() : Number(value)))
    carbsG: number | null;

    @ApiProperty({
        description: 'Target fats in grams',
        example: 60,
        required: false
    })
    @Expose()
    @Transform(({ value }) => value === null ? null : (typeof value === 'object' && value?.toNumber ? value.toNumber() : Number(value)))
    fatsG: number | null;

    @ApiProperty({ description: 'When target becomes active' })
    @Expose()
    startsOn: Date;

    @ApiProperty({
        description: 'When target expires (null = indefinite)',
        required: false
    })
    @Expose()
    endsOn: Date | null;

    @ApiProperty({ description: 'Creation timestamp' })
    @Expose()
    createdAt: Date;

    @ApiProperty({ description: 'Last update timestamp' })
    @Expose()
    updatedAt: Date;
}
