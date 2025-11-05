// dtos/food-item-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';

/**
 * Response DTO for food item
 *
 * Uses class-transformer's @Expose to control serialization
 * Prevents accidental exposure of internal fields
 */
export class FoodItemResponseDto {
    @ApiProperty({ description: 'Unique identifier', example: 'uuid' })
    @Expose()
    id: string;

    @ApiProperty({ description: 'Food name', example: 'Chicken Breast' })
    @Expose()
    name: string;

    @ApiProperty({
        description: 'Brand name',
        example: 'Organic Valley',
        required: false
    })
    @Expose()
    brand: string | null;

    @ApiProperty({
        description: 'Serving size in grams',
        example: 100,
        required: false
    })
    @Expose()
    servingG: number | null;

    @ApiProperty({ description: 'Calories per serving', example: 165 })
    @Expose()
    calories: number;

    @ApiProperty({ description: 'Protein in grams', example: 31 })
    @Expose()
    @Transform(({ value }) => (typeof value === 'object' && value?.toNumber ? value.toNumber() : Number(value)))
    proteinG: number;

    @ApiProperty({ description: 'Carbohydrates in grams', example: 0 })
    @Expose()
    @Transform(({ value }) => (typeof value === 'object' && value?.toNumber ? value.toNumber() : Number(value)))
    carbsG: number;

    @ApiProperty({ description: 'Fats in grams', example: 3.6 })
    @Expose()
    @Transform(({ value }) => (typeof value === 'object' && value?.toNumber ? value.toNumber() : Number(value)))
    fatsG: number;

    @ApiProperty({
        description: 'Tags for categorization',
        example: ['protein', 'lean', 'meat'],
        type: [String]
    })
    @Expose()
    tags: string[];

    @ApiProperty({
        description: 'Source of food data',
        example: 'user',
        required: false
    })
    @Expose()
    source: string | null;

    @ApiProperty({ description: 'Creation timestamp' })
    @Expose()
    createdAt: Date;

    @ApiProperty({ description: 'Last update timestamp' })
    @Expose()
    updatedAt: Date;
}
