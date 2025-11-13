import {
  Injectable,
  ExecutionContext,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';

/**
 * Custom Throttler Guard
 *
 * Extends NestJS ThrottlerGuard with:
 * - Structured logging for rate limit violations
 * - Proper Retry-After headers
 * - Metrics tracking (for future Prometheus/Grafana integration)
 * - User-friendly error messages
 *
 * This guard is applied globally and can be overridden per-endpoint
 * using the @Throttle() decorator or @SkipThrottle() decorator.
 */
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(CustomThrottlerGuard.name);

  /**
   * Override canActivate to skip throttling in test environment
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Skip throttling in test environment with high limits
    const throttleLimit = parseInt(process.env.THROTTLE_LIMIT || '10', 10);
    if (throttleLimit >= 10000) {
      return true;
    }

    return super.canActivate(context);
  }

  /**
   * Override throwThrottlingException to add custom logic
   *
   * This method is called when rate limit is exceeded
   */
  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: any,
  ): Promise<void> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Extract user context for logging
    const userId = (request as any).user?.id || 'anonymous';
    const ipAddress = request.ip || request.socket?.remoteAddress || 'unknown';
    const endpoint = `${request.method} ${request.path}`;

    // Log rate limit violation with context
    this.logger.warn(
      `Rate limit exceeded: User ${userId} | IP ${ipAddress} | Endpoint: ${endpoint} | Limit: ${throttlerLimitDetail.limit}/${throttlerLimitDetail.ttl}ms`,
    );

    // Add Retry-After header (in seconds)
    const retryAfterSeconds = Math.ceil(throttlerLimitDetail.ttl / 1000);

    // Only set headers if setHeader method exists (not available in SuperTest)
    if (response && typeof response.setHeader === 'function') {
      response.setHeader('Retry-After', retryAfterSeconds.toString());
      response.setHeader('X-RateLimit-Limit', throttlerLimitDetail.limit.toString());
      response.setHeader('X-RateLimit-Remaining', '0');
      response.setHeader(
        'X-RateLimit-Reset',
        (Date.now() + throttlerLimitDetail.ttl).toString(),
      );
    }

    // Track metrics (for future integration with monitoring tools)
    this.trackRateLimitViolation({
      userId,
      ipAddress,
      endpoint,
      limit: throttlerLimitDetail.limit,
      ttl: throttlerLimitDetail.ttl,
    });

    // Throw custom exception with user-friendly message
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: `Too many requests. Please try again in ${retryAfterSeconds} seconds.`,
        error: 'TooManyRequests',
        details: {
          limit: throttlerLimitDetail.limit,
          windowMs: throttlerLimitDetail.ttl,
          retryAfterSeconds,
        },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /**
   * Generate tracker key for rate limiting
   *
   * Uses userId if authenticated, falls back to IP address
   * This ensures per-user rate limiting (not just per-IP)
   */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Prefer user ID if authenticated
    const userId = req.user?.id;
    if (userId) {
      return `user:${userId}`;
    }

    // Fall back to IP address for unauthenticated requests
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    return `ip:${ip}`;
  }

  /**
   * Track rate limit violations for metrics/monitoring
   *
   * Future enhancement: Send to Prometheus, Datadog, CloudWatch, etc.
   */
  private trackRateLimitViolation(violation: {
    userId: string;
    ipAddress: string | undefined;
    endpoint: string;
    limit: number;
    ttl: number;
  }): void {
    // For now, just log structured data
    // TODO: Integrate with metrics service (Prometheus, Datadog, etc.)
    this.logger.debug(
      `[METRICS] Rate limit violation: ${JSON.stringify(violation)}`,
    );

    // Future implementation:
    // this.metricsService.increment('rate_limit.violations', {
    //   endpoint: violation.endpoint,
    //   userId: violation.userId,
    // });
  }
}
