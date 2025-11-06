import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Centralized Prisma Error Handler
 *
 * Converts Prisma errors into appropriate HTTP exceptions with user-friendly messages.
 *
 * Usage:
 * ```typescript
 * try {
 *   await this.prisma.user.create({ data: dto });
 * } catch (error) {
 *   handlePrismaError(error, this.logger, 'create user');
 * }
 * ```
 *
 * Benefits:
 * - Consistent error handling across all services
 * - Prevents leaking internal database details to clients
 * - Automatic logging with context
 * - Type-safe error detection
 */

/**
 * Standard error response format
 */
export interface ErrorResponse {
  message: string;
  error: string;
  details?: any;
}

/**
 * Handle Prisma errors and convert to HTTP exceptions
 *
 * @param error - The caught error
 * @param logger - Logger instance for logging errors
 * @param operation - Human-readable operation description (e.g., "create user", "update workout")
 * @throws {HttpException} - Appropriate HTTP exception based on error type
 */
export function handlePrismaError(
  error: unknown,
  logger: Logger,
  operation: string,
): never {
  // Handle known Prisma errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return handleKnownPrismaError(error, logger, operation);
  }

  // Handle Prisma validation errors
  if (error instanceof Prisma.PrismaClientValidationError) {
    logger.error(`Validation error during ${operation}`, error.message);
    throw new BadRequestException({
      message: `Invalid data provided for ${operation}`,
      error: 'ValidationError',
    });
  }

  // Handle Prisma unknown errors (usually network/connection issues)
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    logger.error(`Database error during ${operation}`, error.message);
    throw new InternalServerErrorException({
      message: `Database operation failed for ${operation}`,
      error: 'DatabaseError',
    });
  }

  // Handle Prisma initialization errors
  if (error instanceof Prisma.PrismaClientInitializationError) {
    logger.error(`Database connection error during ${operation}`, error.message);
    throw new InternalServerErrorException({
      message: 'Database connection failed',
      error: 'DatabaseConnectionError',
    });
  }

  // Handle Prisma Rust panic errors (critical)
  if (error instanceof Prisma.PrismaClientRustPanicError) {
    logger.error(`Critical database error during ${operation}`, error.message);
    throw new InternalServerErrorException({
      message: 'Critical database error occurred',
      error: 'CriticalDatabaseError',
    });
  }

  // Re-throw if already an HTTP exception
  if (
    error instanceof BadRequestException ||
    error instanceof NotFoundException ||
    error instanceof ConflictException ||
    error instanceof InternalServerErrorException
  ) {
    throw error;
  }

  // Log and wrap unexpected errors
  logger.error(
    `Unexpected error during ${operation}: ${error instanceof Error ? error.message : String(error)}`,
    error instanceof Error ? error.stack : undefined,
  );
  throw new InternalServerErrorException({
    message: `Failed to ${operation}`,
    error: 'UnexpectedError',
  });
}

/**
 * Handle known Prisma error codes
 *
 * @see https://www.prisma.io/docs/reference/api-reference/error-reference
 */
function handleKnownPrismaError(
  error: Prisma.PrismaClientKnownRequestError,
  logger: Logger,
  operation: string,
): never {
  const { code, meta } = error;

  switch (code) {
    // P2000: Value too long for column
    case 'P2000':
      logger.warn(`Value too long during ${operation}`, meta);
      throw new BadRequestException({
        message: `Input value is too long for ${operation}`,
        error: 'ValueTooLong',
        details: meta,
      });

    // P2001: Record not found (WHERE condition failed)
    case 'P2001':
      logger.warn(`Record not found during ${operation}`, meta);
      throw new NotFoundException({
        message: `Record not found for ${operation}`,
        error: 'RecordNotFound',
      });

    // P2002: Unique constraint violation
    case 'P2002':
      const target = meta?.target as string[] | undefined;
      const fields = target?.join(', ') || 'fields';
      logger.warn(`Unique constraint violation during ${operation}: ${fields}`, meta);
      throw new ConflictException({
        message: `A record with the same ${fields} already exists`,
        error: 'UniqueConstraintViolation',
        details: { fields: target },
      });

    // P2003: Foreign key constraint violation
    case 'P2003':
      const fieldName = meta?.field_name as string | undefined;
      logger.warn(`Foreign key constraint violation during ${operation}: ${fieldName}`, meta);
      throw new BadRequestException({
        message: `Invalid reference: ${fieldName || 'related record'} does not exist`,
        error: 'ForeignKeyViolation',
        details: { field: fieldName },
      });

    // P2004: Constraint violation
    case 'P2004':
      logger.warn(`Constraint violation during ${operation}`, meta);
      throw new BadRequestException({
        message: `Data constraint violated for ${operation}`,
        error: 'ConstraintViolation',
      });

    // P2011: Null constraint violation
    case 'P2011':
      const nullField = meta?.target as string | undefined;
      logger.warn(`Null constraint violation during ${operation}: ${nullField}`, meta);
      throw new BadRequestException({
        message: `Required field ${nullField || 'missing'} cannot be null`,
        error: 'NullConstraintViolation',
        details: { field: nullField },
      });

    // P2014: Relation violation
    case 'P2014':
      logger.warn(`Relation violation during ${operation}`, meta);
      throw new BadRequestException({
        message: `Invalid relationship for ${operation}`,
        error: 'RelationViolation',
      });

    // P2015: Related record not found
    case 'P2015':
      logger.warn(`Related record not found during ${operation}`, meta);
      throw new NotFoundException({
        message: `Related record not found for ${operation}`,
        error: 'RelatedRecordNotFound',
      });

    // P2025: Record to update/delete not found
    case 'P2025':
      logger.warn(`Record to modify not found during ${operation}`, meta);
      throw new NotFoundException({
        message: `Record not found for ${operation}`,
        error: 'RecordNotFound',
      });

    // P2016: Query interpretation error
    case 'P2016':
      logger.error(`Query interpretation error during ${operation}`, meta);
      throw new InternalServerErrorException({
        message: `Invalid query for ${operation}`,
        error: 'QueryError',
      });

    // P2021: Table does not exist
    case 'P2021':
      logger.error(`Table does not exist during ${operation}`, meta);
      throw new InternalServerErrorException({
        message: `Database schema error for ${operation}`,
        error: 'SchemaError',
      });

    // P2022: Column does not exist
    case 'P2022':
      logger.error(`Column does not exist during ${operation}`, meta);
      throw new InternalServerErrorException({
        message: `Database schema error for ${operation}`,
        error: 'SchemaError',
      });

    // P2024: Timed out fetching connection from pool
    case 'P2024':
      logger.error(`Connection timeout during ${operation}`);
      throw new InternalServerErrorException({
        message: `Database connection timeout for ${operation}`,
        error: 'ConnectionTimeout',
      });

    // P2034: Transaction conflict
    case 'P2034':
      logger.warn(`Transaction conflict during ${operation}`, meta);
      throw new ConflictException({
        message: `Transaction conflict occurred for ${operation}. Please retry.`,
        error: 'TransactionConflict',
      });

    // Default: Log full error and throw generic message
    default:
      logger.error(
        `Unhandled Prisma error ${code} during ${operation}`,
        { code, meta, message: error.message },
      );
      throw new InternalServerErrorException({
        message: `Database error occurred for ${operation}`,
        error: 'DatabaseError',
        details: { code },
      });
  }
}

/**
 * Wrap async function with Prisma error handling
 *
 * @param fn - Async function to execute
 * @param logger - Logger instance
 * @param operation - Operation description
 * @returns Promise with function result
 *
 * @example
 * ```typescript
 * return withPrismaErrorHandling(
 *   () => this.prisma.user.create({ data: dto }),
 *   this.logger,
 *   'create user'
 * );
 * ```
 */
export async function withPrismaErrorHandling<T>(
  fn: () => Promise<T>,
  logger: Logger,
  operation: string,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    handlePrismaError(error, logger, operation);
  }
}
