// common/interceptors/audit-logging.interceptor.ts
import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';

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

    constructor(private readonly prisma: PrismaService) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest();
        const method = request.method;

        // Only log mutating operations
        const mutateMethods = ['POST', 'PATCH', 'PUT', 'DELETE'];
        if (!mutateMethods.includes(method)) {
            return next.handle();
        }

        const userId = request.user?.sub; // From JWT
        const route = request.route?.path || request.url;
        const ip = request.ip || request.connection?.remoteAddress;
        const userAgent = request.headers['user-agent'];

        return next.handle().pipe(
            tap({
                next: async (response) => {
                    try {
                        // Determine entity type from route
                        const entityType = this.extractEntityType(route);
                        if (!entityType) return;

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
     * Extract entity type from route path
     */
    private extractEntityType(route: string): string | null {
        if (route.includes('/nutrition/foods')) return 'FoodItem';
        if (route.includes('/nutrition/meals')) return 'MealLog';
        if (route.includes('/nutrition/targets')) return 'MacroTarget';
        if (route.includes('/nutrition/grocery-lists')) return 'GroceryList';
        if (route.includes('/workout-logging')) return 'WorkoutLog';
        return null;
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
