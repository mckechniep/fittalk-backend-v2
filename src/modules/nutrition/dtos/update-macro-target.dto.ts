// dtos/update-macro-target.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateMacroTargetDto } from './create-macro-target.dto';

/**
 * DTO for updating a macro target.
 *
 * All fields optional (partial update).
 * Inherits validation from CreateMacroTargetDto.
 */
export class UpdateMacroTargetDto extends PartialType(CreateMacroTargetDto) { }
