// dtos/update-consultation.dto.ts
import { IsArray, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { ConsultationAnswerDto } from './create-consultation.dto'

/**
 * Updates existing consultation session answers.
 * 
 * Design decisions:
 * - Requires at least one answer (not optional) - if updating, must have data
 * - Supports partial updates: only send changed answers, not entire consultation
 * - Reuses ConsultationAnswerDto for consistency
 * - Service layer handles upsert logic (insert new, update existing by questionId)
 * 
 * Use cases:
 * - User goes back and changes previous answers
 * - User continues incomplete consultation
 * - AI assistant suggests corrections (e.g., "Did you mean 75kg, not 750kg?")
 */

export class UpdateConsultationDto {
    @IsArray()
    @ValidateNested({ each: true})
    @Type(() => ConsultationAnswerDto)
    answers: ConsultationAnswerDto[] 
}