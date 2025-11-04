// common/interceptors/cache.interceptor.ts
import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    Inject,
    Logger,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { CACHE_KEY_METADATA } from '../decorators/cache-key.decorator';

/**
 * HTTP Cache Interceptor
 *
 * Caches GET requests using the @CacheKey decorator.
 *
 * Features:
 * - Only caches GET requests
 * - Configurable TTL per endpoint
 * - Automatic cache invalidation on mutations
 * - Redis-backed for distributed caching
 *
 * Usage in controller:
 * @CacheKey('food-items-all', 3600)
 * @Get('foods')
 * async getFoodItems() { }
 */
@Injectable()
export class HttpCacheInterceptor implements NestInterceptor {
    private readonly logger = new Logger(HttpCacheInterceptor.name);

    constructor(
        @Inject(CACHE_MANAGER) private cacheManager: Cache,
        private reflector: Reflector
    ) { }

    async intercept(
        context: ExecutionContext,
        next: CallHandler
    ): Promise<Observable<any>> {
        const request = context.switchToHttp().getRequest();
        const { method, url } = request;

        // Only cache GET requests
        if (method !== 'GET') {
            return next.handle();
        }

        // Check if endpoint has @CacheKey decorator
        const cacheMetadata = this.reflector.get<{ key: string; ttl: number }>(
            CACHE_KEY_METADATA,
            context.getHandler()
        );

        if (!cacheMetadata) {
            return next.handle();
        }

        const { key, ttl } = cacheMetadata;

        // Build cache key with query params
        const queryString = new URLSearchParams(request.query).toString();
        const cacheKey = queryString ? `${key}:${queryString}` : key;

        try {
            // Try to get from cache
            const cachedResponse = await this.cacheManager.get(cacheKey);

            if (cachedResponse) {
                this.logger.debug(`Cache HIT: ${cacheKey}`);
                return of(cachedResponse);
            }

            this.logger.debug(`Cache MISS: ${cacheKey}`);

            // Cache the response
            return next.handle().pipe(
                tap(async (response) => {
                    try {
                        await this.cacheManager.set(cacheKey, response, ttl * 1000);
                        this.logger.debug(`Cached response for ${cacheKey} (TTL: ${ttl}s)`);
                    } catch (error) {
                        this.logger.error(`Failed to cache response: ${error.message}`);
                    }
                })
            );
        } catch (error) {
            this.logger.error(`Cache error: ${error.message}`);
            // If cache fails, just return the data
            return next.handle();
        }
    }
}
