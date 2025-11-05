// dtos/update-meal-log.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateMealLogDto } from './create-meal-log.dto';

/**
 * DTO for updating a meal log.
 *
 * All fields optional (partial update).
 * Can update meal type, notes, and food entries.
 *
 * Use cases:
 * - Fix mistakes: "I meant 2 servings, not 1"
 * - Add forgotten foods: "I forgot to log my protein shake"
 * - Update notes: "Actually this was at a restaurant"
 */
export class UpdateMealLogDto extends PartialType(CreateMealLogDto) { }
