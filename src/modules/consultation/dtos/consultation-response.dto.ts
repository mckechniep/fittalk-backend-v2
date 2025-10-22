//dtos/consultation-response.dto.ts
import { Expose, Type } from 'class-transformer'
/**
 * Response DTO for consultation session.
 * 
 * Design decisions:
 * - Uses @Expose() to explicitly control what gets serialized
 * - Includes nested question details (avoid N+1 queries on client)
 * - Transforms Prisma types to clean API contract
 * - Hides internal DB fields (no createdAt/updatedAt on nested objects unless needed)
 * 
 * Use cases:
 * - GET /consultation/:id - Fetch consultation with all answers
 * - POST /consultation - Returns newly created session
 * - PATCH /consultation/:id - Returns updated session
 */

export class ConsultationResponseDto {
@Expose()
id: string
@Expose()
userId: string
@Expose()
status: 'pending' | 'completed'
@Expose()
startedAt: Date
@Expose()
completedAt: Date | null
@Expose()
@Type(() => ConsultationAnswerResponseDto)
answer: ConsultationAnswerResponseDto[]


@Expose()
createdAt: Date
@Expose()
updatedAt: Date
}

/**
 * Embedded question details within answer response.
 * Subset of ConsultationQuestion model - only client-needed fields.
 */
export class QuestionDetailsDto {
  @Expose()
  id: string;

  @Expose()
  code: string;

  @Expose()
  prompt: string;

  @Expose()
  helpText: string | null;

  @Expose()
  type: string;

  /**
   * Options for enum/scale/multi questions.
   * Example: ["fat_loss", "muscle_gain", "performance"]
   */
  @Expose()
  optionsJson: unknown | null;
}

/**
 * Individual answer in consultation response.
 * Includes full question details to avoid client needing separate question lookup.
 */
export class ConsultationAnswerResponseDto {
@Expose()
id: string

@Expose()
questionId: string

/**
   * Full question details embedded for convenience.
   * Alternative: Client could fetch questions separately, but this reduces round trips.
   */
  @Expose()
  @Type(() => QuestionDetailsDto)
  question: QuestionDetailsDto;


/**
   * User's answer value - shape depends on question.type.
   * See CreateConsultationDto for value format documentation.
   */
  @Expose()
  value: unknown;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;
}