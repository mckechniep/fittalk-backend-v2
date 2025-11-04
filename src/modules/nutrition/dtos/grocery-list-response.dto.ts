// dtos/grocery-list-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { FoodItemResponseDto } from './food-item-response.dto';

/**
 * Response DTO for grocery item
 */
export class GroceryItemResponseDto {
    @ApiProperty({ description: 'Unique identifier', example: 'uuid' })
    @Expose()
    id: string;

    @ApiProperty({ description: 'Grocery list ID', example: 'uuid' })
    @Expose()
    listId: string;

    @ApiProperty({
        description: 'Food item ID reference',
        example: 'uuid',
        required: false
    })
    @Expose()
    foodItemId: string | null;

    @ApiProperty({
        description: 'Associated food item details',
        type: FoodItemResponseDto,
        required: false
    })
    @Expose()
    @Type(() => FoodItemResponseDto)
    foodItem?: FoodItemResponseDto | null;

    @ApiProperty({ description: 'Item name', example: 'Chicken Breast' })
    @Expose()
    name: string;

    @ApiProperty({
        description: 'Quantity/amount',
        example: '2 lbs',
        required: false
    })
    @Expose()
    quantity: string | null;

    @ApiProperty({ description: 'Whether item is checked off', example: false })
    @Expose()
    isChecked: boolean;

    @ApiProperty({ description: 'Creation timestamp' })
    @Expose()
    createdAt: Date;

    @ApiProperty({ description: 'Last update timestamp' })
    @Expose()
    updatedAt: Date;
}

/**
 * Response DTO for grocery list
 */
export class GroceryListResponseDto {
    @ApiProperty({ description: 'Unique identifier', example: 'uuid' })
    @Expose()
    id: string;

    @ApiProperty({ description: 'User ID', example: 'uuid' })
    @Expose()
    userId: string;

    @ApiProperty({ description: 'List title', example: 'Weekly Grocery List' })
    @Expose()
    title: string;

    @ApiProperty({ description: 'Week this list is for' })
    @Expose()
    weekOf: Date;

    @ApiProperty({
        description: 'Items in this grocery list',
        type: [GroceryItemResponseDto]
    })
    @Expose()
    @Type(() => GroceryItemResponseDto)
    items: GroceryItemResponseDto[];

    @ApiProperty({ description: 'Creation timestamp' })
    @Expose()
    createdAt: Date;

    @ApiProperty({ description: 'Last update timestamp' })
    @Expose()
    updatedAt: Date;
}
