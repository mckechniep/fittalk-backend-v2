// consultation.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import {
  CreateConsultationDto,
  ConsultationAnswerDto,
} from './dtos/create-consultation.dto';
import { UpdateConsultationDto } from './dtos/update-consultation.dto';
import { ConsultationResponseDto } from './dtos/consultation-response.dto';
import {
  UpsertAvailabilityDto,
  AvailabilityWindowResponseDto,
  AvailabilityWindowDto,
} from './dtos/availability-window.dto';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Consultation & Availability Service
 *
 * Handles all business logic for user onboarding consultation and weekly availability.
 *
 * Design principles:
 * - Ownership validation: All operations verify user owns the resource
 * - Transactional integrity: Multi-step operations wrapped in transactions
 * - Rich error messages: Helpful errors for client debugging
 * - Separation of concerns: Database logic here, HTTP logic in controller
 * - Idempotency where possible: Safe to retry operations
 *
 * Dependencies:
 * - PrismaService: Database access
 * - Logger: Structured logging for observability
 */
@Injectable()
export class ConsultationService {
  private readonly logger = new Logger(ConsultationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService, // Add this
  ) {}

  // ==================== CONSULTATION SESSION METHODS ====================

  /**
   * Create new consultation session.
   *
   * Flow:
   * 1. Create session record (status: pending)
   * 2. If answers provided, save them atomically
   * 3. Return full session with answers
   *
   * Transaction: Ensures session + answers created together or not at all
   * Idempotency: Not idempotent - creates new session each time
   */
  async createSession(
    userId: string,
    dto: CreateConsultationDto,
  ): Promise<ConsultationResponseDto> {
    this.logger.log(`Creating consultation session for user ${userId}`);

    try {
      const session = await this.prisma.$transaction(
        async (tx) => {
          // Create session
          const newSession = await tx.consultationSession.create({
            data: {
              userId,
              status: 'pending',
            },
          });

          // Save any provided answers
          if (dto.answers && dto.answers.length > 0) {
            await this.saveAnswersInTransaction(tx, newSession.id, dto.answers);
          }

          // Fetch complete session with answers
          return tx.consultationSession.findUnique({
            where: { id: newSession.id },
            include: {
              answers: {
                include: {
                  question: true,
                },
              },
            },
          });
        },
        {
          maxWait: 2000, // Max time to wait for transaction lock
          timeout: 5000, // Max transaction duration
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        },
      );

      if (!session) {
        throw new InternalServerErrorException(
          'Failed to create consultation session',
        );
      }

      return this.transformToResponseDto(session);
    } catch (error) {
      // Handle Prisma-specific errors
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          // Unique constraint violation
          throw new BadRequestException(
            'A consultation session already exists for this user',
          );
        }
        if (error.code === 'P2025') {
          // Record not found
          throw new NotFoundException(
            'Required resource not found during session creation',
          );
        }
      }

      // Handle timeout or lock errors
      if (error instanceof Prisma.PrismaClientUnknownRequestError) {
        this.logger.error(
          'Database transaction failed with unknown error',
          error,
        );
        throw new InternalServerErrorException(
          'Failed to create consultation session due to database error',
        );
      }

      // Re-throw known application exceptions
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      // Log and wrap unexpected errors
      this.logger.error(
        `Unexpected error creating consultation session: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        'Failed to create consultation session',
      );
    }
  }

  /**
   * Get consultation session by ID.
   *
   * Security: Verifies session belongs to requesting user
   *
   * Returns: Full session with answers and nested question details
   * Throws: 404 if not found, 403 if wrong user
   */
  async getSession(
    sessionId: string,
    userId: string,
  ): Promise<ConsultationResponseDto> {
    const session = await this.prisma.consultationSession.findUnique({
      where: { id: sessionId },
      include: {
        answers: {
          include: {
            question: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException(
        `Consultation session ${sessionId} not found`,
      );
    }

    // Ownership check
    if (session.userId !== userId) {
      this.logger.warn(
        `User ${userId} attempted to access session ${sessionId} owned by ${session.userId}`,
      );
      throw new ForbiddenException('You do not have access to this session');
    }

    return this.transformToResponseDto(session);
  }

  /**
   * Get user's most recent consultation session.
   *
   * Use case: Check onboarding status on app launch
   *
   * Returns: Most recent session or null if none exist
   */
  async getCurrentSession(
    userId: string,
  ): Promise<ConsultationResponseDto | null> {
    const session = await this.prisma.consultationSession.findFirst({
      where: { userId },
      include: {
        answers: {
          include: {
            question: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!session) {
      return null;
    }

    return this.transformToResponseDto(session);
  }

  /**
   * Update consultation session answers (partial update).
   *
   * Flow:
   * 1. Verify session exists and user owns it
   * 2. Check session is not already completed
   * 3. Upsert answers (insert new, update existing)
   * 4. Return updated session
   *
   * Transaction: Ensures all answers saved together
   * Idempotency: Yes - same answers produce same result
   */
  async updateSession(
    sessionId: string,
    userId: string,
    dto: UpdateConsultationDto,
  ): Promise<ConsultationResponseDto> {
    // Verify session exists and ownership
    const session = await this.getSessionOrThrow(sessionId, userId);

    // Cannot update completed session
    if (session.status === 'completed') {
      throw new BadRequestException('Cannot update completed consultation');
    }

    this.logger.log(
      `Updating consultation ${sessionId} with ${dto.answers.length} answers`,
    );

    try {
      // Upsert answers in transaction
      await this.prisma.$transaction(
        async (tx) => {
          await this.saveAnswersInTransaction(tx, sessionId, dto.answers);
        },
        {
          maxWait: 2000,
          timeout: 5000,
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        },
      );

      // Return updated session
      return this.getSession(sessionId, userId);
    } catch (error) {
      // Handle Prisma-specific errors
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(
            'Consultation session or question not found',
          );
        }
      }

      // Re-throw known application exceptions
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      // Log and wrap unexpected errors
      this.logger.error(
        `Failed to update consultation session: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        'Failed to update consultation session',
      );
    }
  }

  /**
   * Submit single answer (alternative to batch update).
   *
   * Use case: Mobile saves progress after each question
   *
   * Implementation: Wraps single answer in array and calls batch logic
   */
  async submitAnswer(
    sessionId: string,
    userId: string,
    answer: ConsultationAnswerDto,
  ): Promise<ConsultationResponseDto> {
    return this.updateSession(sessionId, userId, {
      answers: [answer],
    });
  }

  /**
   * Mark consultation as completed.
   *
   * Validation:
   * - Session must be pending (not already completed)
   * - All required questions must be answered
   *
   * Side effects:
   * - Sets status = 'completed', completedAt = now()
   * - TODO: Trigger AI plan generation (queue job)
   * - TODO: Send notification "Your plan is being generated"
   *
   * Returns: Completed session
   */
  async completeSession(
    sessionId: string,
    userId: string,
  ): Promise<ConsultationResponseDto> {
    // Verify session exists and ownership
    const session = await this.getSessionOrThrow(sessionId, userId);

    if (session.status === 'completed') {
      throw new BadRequestException('Consultation already completed');
    }

    // Validate all required questions answered
    await this.validateRequiredQuestionsAnswered(sessionId);

    this.logger.log(`Completing consultation session ${sessionId}`);

    // Mark as completed
    await this.prisma.consultationSession.update({
      where: { id: sessionId },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
    });

    // Send "Plan Ready" notification (push + email with consultation summary)
    try {
      await this.notificationsService.sendPlanReadyNotification(
        userId,
        sessionId,
      );
      this.logger.log(`Sent plan ready notification to user ${userId}`);
    } catch (error) {
      // Don't fail consultation completion if notification fails
      this.logger.error(
        `Failed to send plan ready notification: ${error.message}`,
        error.stack,
      );
    }

    // TODO: Emit event or queue job for AI plan generation
    // await this.eventEmitter.emit('consultation.completed', { userId, sessionId });

    return this.getSession(sessionId, userId);
  }

  /**
   * Get all active consultation questions.
   *
   * Use case: Mobile fetches questions to render onboarding flow
   *
   * Returns: Questions ordered by creation (defines question order)
   *
   * Caching: Consider Redis cache with 1 hour TTL (static data)
   */
  async getActiveQuestions() {
    const questions = await this.prisma.consultationQuestion.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    return questions;
  }

  // ==================== AVAILABILITY METHODS ====================

  /**
   * Upsert availability windows (replace all).
   *
   * Strategy: "Replace all" - delete existing, insert new
   *
   * Validation:
   * - No overlapping windows on same day
   * - startMin < endMin for each window
   *
   * Transaction: Atomic delete + insert prevents partial state
   *
   * Returns: Created windows with database IDs
   */
  async upsertAvailability(
    userId: string,
    dto: UpsertAvailabilityDto,
  ): Promise<AvailabilityWindowResponseDto[]> {
    this.logger.log(
      `Upserting ${dto.windows.length} availability windows for user ${userId}`,
    );

    // Validate no overlaps
    this.validateNoOverlaps(dto.windows);

    // Validate time ranges
    dto.windows.forEach((window) => {
      if (window.startMin >= window.endMin) {
        throw new BadRequestException(
          `Invalid time range on day ${window.dayOfWeek}: start (${window.startMin}) must be before end (${window.endMin})`,
        );
      }
    });

    try {
      // Replace all windows in transaction
      const windows = await this.prisma.$transaction(
        async (tx) => {
          // Delete all existing
          await tx.availabilityWindow.deleteMany({
            where: { userId },
          });

          // Insert new (if any)
          if (dto.windows.length === 0) {
            return [];
          }

          await tx.availabilityWindow.createMany({
            data: dto.windows.map((window) => ({
              userId,
              dayOfWeek: window.dayOfWeek,
              startMin: window.startMin,
              endMin: window.endMin,
              priority: window.priority ?? 0,
            })),
          });

          // Fetch created windows
          return tx.availabilityWindow.findMany({
            where: { userId },
            orderBy: [{ dayOfWeek: 'asc' }, { startMin: 'asc' }],
          });
        },
        {
          maxWait: 2000,
          timeout: 5000,
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        },
      );

      return windows.map((w) => this.transformAvailabilityToDto(w));
    } catch (error) {
      // Handle Prisma-specific errors
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException(
            'Duplicate availability window detected',
          );
        }
      }

      // Re-throw known application exceptions
      if (error instanceof BadRequestException) {
        throw error;
      }

      // Log and wrap unexpected errors
      this.logger.error(
        `Failed to upsert availability windows: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        'Failed to update availability windows',
      );
    }
  }

  /**
   * Get user's availability windows.
   *
   * Returns: Ordered by day (Sun-Sat), then start time
   */
  async getAvailability(
    userId: string,
  ): Promise<AvailabilityWindowResponseDto[]> {
    const windows = await this.prisma.availabilityWindow.findMany({
      where: { userId },
      orderBy: [{ dayOfWeek: 'asc' }, { startMin: 'asc' }],
    });

    return windows.map((w) => this.transformAvailabilityToDto(w));
  }

  /**
   * Delete single availability window.
   *
   * Security: Verifies window belongs to user
   *
   * Returns: void
   * Throws: 404 if not found, 403 if wrong user
   */
  async deleteAvailabilityWindow(
    windowId: string,
    userId: string,
  ): Promise<void> {
    const window = await this.prisma.availabilityWindow.findUnique({
      where: { id: windowId },
    });

    if (!window) {
      throw new NotFoundException(`Availability window ${windowId} not found`);
    }

    if (window.userId !== userId) {
      this.logger.warn(
        `User ${userId} attempted to delete window ${windowId} owned by ${window.userId}`,
      );
      throw new ForbiddenException(
        'You do not have access to this availability window',
      );
    }

    await this.prisma.availabilityWindow.delete({
      where: { id: windowId },
    });

    this.logger.log(`Deleted availability window ${windowId}`);
  }

  // ==================== PRIVATE HELPER METHODS ====================

  /**
   * Get session or throw appropriate error.
   *
   * Helper to reduce boilerplate in methods that need session validation.
   */
  private async getSessionOrThrow(sessionId: string, userId: string) {
    const session = await this.prisma.consultationSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(
        `Consultation session ${sessionId} not found`,
      );
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('You do not have access to this session');
    }

    return session;
  }

  /**
   * Save answers in transaction (upsert logic).
   *
   * Strategy: For each answer:
   * - Check if answer exists for this session + questionId
   * - If exists: UPDATE value and timestamp
   * - If not: INSERT new answer
   *
   * Transaction parameter: Allows calling from parent transaction
   */
  private async saveAnswersInTransaction(
    tx: any, // Prisma transaction type
    sessionId: string,
    answers: ConsultationAnswerDto[],
  ) {
    for (const answer of answers) {
      // Verify question exists
      const question = await tx.consultationQuestion.findUnique({
        where: { id: answer.questionId },
      });

      if (!question) {
        throw new BadRequestException(
          `Question ${answer.questionId} not found`,
        );
      }

      // TODO: Validate value matches question type
      // this.validateAnswerValue(question.type, answer.value);

      // Upsert answer
      await tx.consultationAnswer.upsert({
        where: {
          sessionId_questionId: {
            sessionId,
            questionId: answer.questionId,
          },
        },
        update: {
          valueJson: answer.value,
        },
        create: {
          sessionId,
          questionId: answer.questionId,
          valueJson: answer.value,
        },
      });
    }
  }

  /**
   * Validate all required questions are answered.
   *
   * Logic:
   * 1. Get all required questions (future: add isRequired field to question)
   * 2. Get answered questions for session
   * 3. Check if all required questions have answers
   *
   * TODO: Add `isRequired` field to ConsultationQuestion schema
   * For now: Assumes all questions are required
   */
  private async validateRequiredQuestionsAnswered(sessionId: string) {
    const allQuestions = await this.prisma.consultationQuestion.findMany({
      where: { isActive: true },
    });

    const answeredQuestions = await this.prisma.consultationAnswer.findMany({
      where: { sessionId },
      select: { questionId: true },
    });

    const answeredQuestionIds = new Set(
      answeredQuestions.map((a) => a.questionId),
    );

    const missingQuestions = allQuestions.filter(
      (q) => !answeredQuestionIds.has(q.id),
    );

    if (missingQuestions.length > 0) {
      const missingCodes = missingQuestions.map((q) => q.code).join(', ');
      throw new BadRequestException(
        `Missing required answers for questions: ${missingCodes}`,
      );
    }
  }

  /**
   * Validate no overlapping availability windows.
   *
   * Algorithm:
   * 1. Group windows by day
   * 2. For each day, check all pairs for overlap
   * 3. Overlap exists if: A.start < B.end AND B.start < A.end
   *
   * Time complexity: O(n²) worst case, but n is small (max ~20 windows)
   */
  private validateNoOverlaps(windows: AvailabilityWindowDto[]) {
    for (let i = 0; i < windows.length; i++) {
      for (let j = i + 1; j < windows.length; j++) {
        const a = windows[i];
        const b = windows[j];

        // Only check same day
        if (a.dayOfWeek !== b.dayOfWeek) continue;

        // Check overlap: A.start < B.end AND B.start <= A.end
        // Note: We treat edge-sharing windows (A.end == B.start) as overlapping
        // This ensures no time slots can be double-booked, even at boundaries
        if (a.startMin < b.endMin && b.startMin <= a.endMin) {
          throw new BadRequestException(
            `Overlapping availability windows on day ${this.getDayName(a.dayOfWeek)}: ` +
              `${this.formatMinutes(a.startMin)}-${this.formatMinutes(a.endMin)} overlaps ` +
              `${this.formatMinutes(b.startMin)}-${this.formatMinutes(b.endMin)}`,
          );
        }
      }
    }
  }

  /**
   * Transform Prisma result to ConsultationResponseDto.
   *
   * Uses class-transformer for clean mapping.
   * @Expose() decorators control serialization.
   */
  private transformToResponseDto(session: any): ConsultationResponseDto {
    return plainToInstance(
      ConsultationResponseDto,
      {
        ...session,
        answers: session.answers.map((a: any) => ({
          ...a,
          question: {
            id: a.question.id,
            code: a.question.code,
            prompt: a.question.prompt,
            helpText: a.question.helpText,
            type: a.question.type,
            optionsJson: a.question.optionsJson,
          },
          value: a.valueJson,
        })),
      },
      { excludeExtraneousValues: true },
    );
  }

  /**
   * Transform Prisma AvailabilityWindow to DTO.
   */
  private transformAvailabilityToDto(
    window: any,
  ): AvailabilityWindowResponseDto {
    return plainToInstance(AvailabilityWindowResponseDto, window, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Format minutes to HH:MM for error messages.
   */
  private formatMinutes(totalMin: number): string {
    const hours = Math.floor(totalMin / 60);
    const minutes = totalMin % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  /**
   * Get day name from number (for error messages).
   */
  private getDayName(dayOfWeek: number): string {
    const days = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];
    return days[dayOfWeek] || 'Unknown';
  }
}
