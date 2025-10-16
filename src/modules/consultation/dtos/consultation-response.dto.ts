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
userId: String
@Expose()
status: 'pending' | 'completed'
@Expose()
startedAt: Date
@Expose()
completedAt: Date
@Expose()
@Type(() => ConsultationResponseDto)
answer: ConsultationResponseDto[]


@Expose()
createdAt: Date
@Expose()
updatedAt: Date
}

/**
 * Individual answer in consultation response.
 * Includes full question details to avoid client needing separate question lookup.
 */
