// dtos/update-grocery-list.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateGroceryListDto } from './create-grocery-list.dto';

/**
 * DTO for updating a grocery list.
 *
 * All fields optional (partial update).
 * Can update title, weekOf, and items array.
 *
 * Use cases:
 * - Rename list
 * - Add/remove items
 * - Check off items as purchased
 * - Adjust quantities
 */
export class UpdateGroceryListDto extends PartialType(CreateGroceryListDto) { }
