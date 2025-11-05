// common/interceptors/audit-logging.interceptor.ts
import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_ENTITY_KEY } from '../decorators/audit-entity.decorator';

/**
 * Audit Logging Interceptor
 *
 * Automatically logs all mutating operations (POST, PATCH, PUT, DELETE)
 * to the AuditLog table for compliance and debugging.
 *
 * Logs:
 * - Who performed the action (userId)
 * - What action was performed (CREATE, UPDATE, DELETE)
 * - What entity was affected (entityType, entityId)
 * - When it happened (createdAt)
 * - What changed (prevValues, newValues)
 * - Request metadata (IP, user agent)
 */
@Injectable()
export class AuditLoggingInterceptor implements NestInterceptor {
    private readonly logger = new Logger(AuditLoggingInterceptor.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly reflector: Reflector
    ) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest();
        const method = request.method;

        // Only log mutating operations
        const mutateMethods = ['POST', 'PATCH', 'PUT', 'DELETE'];
        if (!mutateMethods.includes(method)) {
            return next.handle();
        }

        const userId = request.user?.id || request.user?.sub; // From JWT (id for our strategy, sub for standard JWT)
        const route = request.route?.path || request.url;
        const ip = request.ip || request.connection?.remoteAddress;
        const userAgent = request.headers['user-agent'];

        // Extract entity type from metadata (route handler, then controller)
        const entityType = this.reflector.getAllAndOverride<string>(AUDIT_ENTITY_KEY, [
            context.getHandler(), // Route handler decorator takes precedence
            context.getClass(),   // Fall back to controller decorator
        ]);

        return next.handle().pipe(
            tap({
                next: async (response) => {
                    try {
                        // Skip audit logging if no entity type is defined
                        if (!entityType) {
                            return;
                        }

                        // Determine action
                        const action = this.mapMethodToAction(method);

                        // Extract entity ID from response or request
                        const entityId = response?.id || request.params?.id;

                        // Log the audit entry
                        await this.prisma.auditLog.create({
                            data: {
                                userId,
                                action,
                                entityType,
                                entityId,
                                newValues: response || {},
                                ip,
                                userAgent,
                            },
                        });

                        this.logger.log(
                            `Audit: ${action} ${entityType} ${entityId || ''} by user ${userId}`
                        );
                    } catch (error) {
                        // Don't fail the request if audit logging fails
                        this.logger.error('Failed to create audit log:', error);
                    }
                },
                error: (error) => {
                    // Log failed attempts too
                    this.logger.warn(
                        `Failed ${method} ${route} by user ${userId}: ${error.message}`
                    );
                },
            })
        );
    }

    /**
     * Map HTTP method to audit action
     */
    private mapMethodToAction(method: string): string {
        switch (method) {
            case 'POST':
                return 'CREATE';
            case 'PATCH':
            case 'PUT':
                return 'UPDATE';
            case 'DELETE':
                return 'DELETE';
            default:
                return 'UNKNOWN';
        }
    }
}
