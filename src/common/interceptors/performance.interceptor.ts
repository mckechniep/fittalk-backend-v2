// common/interceptors/performance.interceptor.ts
import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Performance Monitoring Interceptor
 *
 * Tracks execution time of all endpoints and logs slow queries.
 *
 * Features:
 * - Measures request-response time
 * - Logs slow endpoints (>1000ms)
 * - Provides metrics for monitoring
 * - Can be extended to send to APM tools (Datadog, New Relic, etc.)
 */
@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
    private readonly logger = new Logger(PerformanceInterceptor.name);
    private readonly SLOW_THRESHOLD_MS = 1000; // 1 second

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest();
        const { method, url } = request;
        const startTime = Date.now();

        return next.handle().pipe(
            tap({
                next: () => {
                    const duration = Date.now() - startTime;

                    // Log slow requests
                    if (duration > this.SLOW_THRESHOLD_MS) {
                        this.logger.warn(
                            `Slow request: ${method} ${url} took ${duration}ms`
                        );
                    } else {
                        this.logger.debug(`${method} ${url} completed in ${duration}ms`);
                    }

                    // Could emit metrics here to APM tools
                    // this.metricsService.recordHttpRequest(method, url, duration, 200);
                },
                error: (error) => {
                    const duration = Date.now() - startTime;
                    this.logger.error(
                        `Failed request: ${method} ${url} failed after ${duration}ms - ${error.message}`
                    );

                    // Could emit error metrics here
                    // this.metricsService.recordHttpRequest(method, url, duration, error.status);
                },
            })
        );
    }
}
