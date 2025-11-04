// common/interceptors/transform.interceptor.ts
import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { plainToInstance } from 'class-transformer';

/**
 * Transform Interceptor
 *
 * Automatically transforms Prisma models to Response DTOs.
 *
 * Benefits:
 * - Prevents accidental exposure of internal fields
 * - Ensures consistent response format
 * - Applies @Expose decorators from DTOs
 * - Removes sensitive data
 *
 * Usage:
 * @UseInterceptors(new TransformInterceptor(FoodItemResponseDto))
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor {
    constructor(private readonly classType: new () => T) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        return next.handle().pipe(
            map((data) => {
                if (!data) return data;

                // Handle arrays
                if (Array.isArray(data)) {
                    return data.map((item) =>
                        plainToInstance(this.classType, item, {
                            excludeExtraneousValues: true,
                        })
                    );
                }

                // Handle paginated responses
                if (data.logs || data.items || data.data) {
                    const dataKey = data.logs ? 'logs' : data.items ? 'items' : 'data';
                    return {
                        ...data,
                        [dataKey]: Array.isArray(data[dataKey])
                            ? data[dataKey].map((item: any) =>
                                plainToInstance(this.classType, item, {
                                    excludeExtraneousValues: true,
                                })
                            )
                            : plainToInstance(this.classType, data[dataKey], {
                                excludeExtraneousValues: true,
                            }),
                    };
                }

                // Handle single objects
                return plainToInstance(this.classType, data, {
                    excludeExtraneousValues: true,
                });
            })
        );
    }
}
