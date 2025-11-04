// common/decorators/cache-key.decorator.ts
import { SetMetadata } from '@nestjs/common';

/**
 * Cache Key Decorator
 *
 * Marks an endpoint for caching with a specific TTL.
 *
 * Usage:
 * @CacheKey('food-items', 3600) // Cache for 1 hour
 * async getFoodItems() { }
 */
export const CACHE_KEY_METADATA = 'cache_key';
export const CACHE_TTL_METADATA = 'cache_ttl';

export const CacheKey = (key: string, ttl: number = 300) =>
    SetMetadata(CACHE_KEY_METADATA, { key, ttl });
