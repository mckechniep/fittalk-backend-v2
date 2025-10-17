// dtos/create-consultation.dto.ts
import { IsOptional, IsArray, ValidateNested, IsString, IsNotEmpty } from 'class-validator'
import { Type } from 'class-transformer'

/**
 * Creates a new consultation session.
 * No answers required upfront - allows starting session and saving progress incrementally.
 * This supports mobile UX where users answer questions one-by-one or in batches.
 */
export class CreateConsultationDto { 
    @IsOptional()
    @IsArray()
    @ValidateNested( { each: true} )
    @Type(() => ConsultationAnswerDto)
    answers?: ConsultationAnswerDto[]

}

/**
 * Individual answer within a consultation session.
 */
export class ConsultationAnswerDto {
  @IsString()
  @IsNotEmpty()
  questionId: string;

  /**
   * Value is flexible JSON - shape depends on question type:
   * - "single": string (selected option)
   * - "multi": string[] (multiple selections)
   * - "scale": number (1-10)
   * - "time_range": { start: string, end: string } or { dayOfWeek: number, startMin: number, endMin: number }[]
   * - "number": number
   * - "text": string
   * - "enum": string
   */
  @IsNotEmpty()
  value: unknown;
}