// dtos/update-food-item.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateFoodItemDto } from './create-food-item.dto';

/**
 * DTO for updating a food item.
 *
 * All fields optional (partial update).
 * Inherits validation from CreateFoodItemDto.
 */
export class UpdateFoodItemDto extends PartialType(CreateFoodItemDto) { }
