// consultation.controller.ts

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ConsultationService } from './consultation.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuditEntity } from '../../common/decorators/audit-entity.decorator';
import {
  CreateConsultationDto,
  ConsultationAnswerDto,
} from './dtos/create-consultation.dto';
import { UpdateConsultationDto } from './dtos/update-consultation.dto';
import { ConsultationResponseDto } from './dtos/consultation-response.dto';
import {
  StandardCreate,
  ReadEndpoint,
  FrequentRead,
  StandardUpdate,
  FrequentMutation,
} from '../../common/guards/throttler/throttler.decorators';

/**
 * Consultation Controller
 *
 * Handles user onboarding consultation flow and question management.
 * All routes require JWT authentication - userId extracted from token.
 *
 * Note: Availability routes moved to AvailabilityController (separate resource).
 *
 * Design decisions:
 * - RESTful conventions: GET/POST/PATCH/DELETE with proper status codes
 * - Resource ownership enforced: users can only access their own data
 * - No admin overrides here (separate admin module if needed)
 * - Validation happens at DTO layer, business logic in service
 *
 * Security:
 * - @UseGuards(JwtAuthGuard) on controller = all routes protected
 * - @CurrentUser() extracts userId from JWT (never trust client-provided userId)
 * - ParseUUIDPipe validates UUID format before hitting service
 */
@Controller('consultation')
@UseGuards(JwtAuthGuard)
export class ConsultationController {
  constructor(private readonly consultationService: ConsultationService) {}

  // ==================== CONSULTATION SESSION ENDPOINTS ====================

  /**
   * POST /consultation
   *
   * Create new consultation session.
   * Use case: User starts onboarding flow in mobile app.
   *
   * Request body: { answers?: ConsultationAnswerDto[] } (optional - can start empty)
   * Returns: Full consultation session with any provided answers
   *
   * Flow:
   * 1. Mobile calls this when user enters onboarding
   * 2. Backend creates session record (status: pending)
   * 3. Client can immediately submit answers or do it incrementally
   */

  @Post()
  @StandardCreate() // 10/min - one-time onboarding action
  @AuditEntity('ConsultationSession')
  @HttpCode(HttpStatus.CREATED)
  async createConsultation(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateConsultationDto,
  ): Promise<ConsultationResponseDto> {
    return this.consultationService.createSession(userId, dto);
  }

  /**
   * GET /consultation/:id
   *
   * Fetch consultation session with all answers and question details.
   * Use case: User returns to incomplete consultation, or reviews completed one.
   *
   * Security: Service verifies session belongs to authenticated user
   *
   * Response includes:
   * - Session status (pending/completed)
   * - All submitted answers with embedded question details
   * - Timestamps for audit trail
   */
  @Get(':id')
  @ReadEndpoint() // 60/min - user checking consultation status
  async getConsultation(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ): Promise<ConsultationResponseDto> {
    return this.consultationService.getSession(sessionId, userId);
  }

  /**
   * GET /consultation
   *
   * Get user's most recent consultation session.
   * Use case: Check if user has completed onboarding.
   *
   * Returns:
   * - Most recent session (by createdAt DESC)
   * - Null if no sessions exist
   *
   * Client logic:
   * - If null or status=pending → show onboarding
   * - If status=completed → proceed to main app
   */
  @Get()
  @FrequentRead() // 100/min - may be called on app startup
  async getCurrentConsultation(
    @CurrentUser('id') userId: string,
  ): Promise<ConsultationResponseDto | null> {
    return this.consultationService.getCurrentSession(userId);
  }

  /**
   * PATCH /consultation/:id
   *
   * Update consultation answers (partial update supported).
   * Use case: User goes back and changes previous answers.
   *
   * Request body: { answers: ConsultationAnswerDto[] }
   * - Only send changed answers, not entire consultation
   * - Service upserts: inserts new answers, updates existing by questionId
   *
   * Validation:
   * - Cannot update completed consultation (throws 400)
   * - Must own the session (throws 403)
   *
   * Returns: Updated consultation session
   */
  @Patch(':id')
  @StandardUpdate() // 15/min - updating answers during onboarding
  @AuditEntity('ConsultationSession')
  async updateConsultation(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Body() dto: UpdateConsultationDto,
  ): Promise<ConsultationResponseDto> {
    return this.consultationService.updateSession(sessionId, userId, dto);
  }

  /**
   * POST /consultation/:id/submit-answer
   *
   * Submit single answer (real-time progress saving).
   * Use case: Mobile saves each answer as user completes it.
   *
   * Alternative to PATCH (which accepts array):
   * - This is more semantic for "add one answer"
   * - Better for tracking individual answer submission events
   * - Can emit analytics per question completion
   *
   * Request body: { questionId: string, value: unknown }
   * Returns: Updated consultation session
   */
  @Post(':id/submit-answer')
  @FrequentMutation() // 20/min - answering questions in sequence
  @AuditEntity('ConsultationAnswer')
  async submitSingleAnswer(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Body() answer: ConsultationAnswerDto,
  ): Promise<ConsultationResponseDto> {
    return this.consultationService.submitAnswer(sessionId, userId, answer);
  }

  /**
   * POST /consultation/:id/complete
   *
   * Mark consultation as completed.
   * Use case: User finishes all required questions and submits.
   *
   * Validation (in service):
   * - All required questions must be answered
   * - Session must be in 'pending' status
   *
   * Side effects:
   * - Sets status = 'completed', completedAt = now()
   * - Triggers AI plan generation (queued job)
   * - May send notification "Your plan is being generated"
   *
   * Returns: Completed consultation session
   *
   * Client next step: Poll for generated workout plan or wait for push notification
   */
  @Post(':id/complete')
  @StandardCreate() // 10/min - one-time completion action
  @AuditEntity('ConsultationSession')
  async completeConsultation(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ): Promise<ConsultationResponseDto> {
    return this.consultationService.completeSession(sessionId, userId);
  }

  // ==================== CONSULTATION QUESTIONS (STATIC) ====================

  /**
   * GET /consultation/questions/all
   *
   * Get all active consultation questions.
   * Use case: Mobile fetches question templates to render onboarding UI.
   *
   * Returns: Array of questions with:
   * - Question code, prompt, helpText
   * - Type (single/multi/scale/etc.)
   * - Options for enum/multi questions
   *
   * Note: This is static data (rarely changes).
   * Consider caching with long TTL (1 hour+) in Redis.
   */
  @Get('questions/all')
  @FrequentRead() // 100/min - static data, may be cached client-side
  async getQuestions() {
    return this.consultationService.getActiveQuestions();
  }
}
