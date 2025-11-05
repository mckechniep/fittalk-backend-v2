import { registerAs } from '@nestjs/config';

/**
 * Throttle/Rate Limiting Configuration
 *
 * Centralized rate limiting configuration for API endpoints.
 * Prevents hard-coded throttle limits throughout the application.
 *
 * Usage:
 * ```typescript
 * // In controller
 * @Throttle({ default: {
 *   limit: this.configService.get('throttle.mutations.limit'),
 *   ttl: this.configService.get('throttle.mutations.ttl')
 * }})
 * async createFoodItem() { ... }
 * ```
 */
export default registerAs('throttle', () => ({
  /**
   * Global default rate limits
   * Applied to all endpoints unless overridden
   */
  global: {
    ttl: parseInt(process.env.THROTTLE_TTL || '60000', 10), // 60 seconds
    limit: parseInt(process.env.THROTTLE_LIMIT || '10', 10), // 10 requests per minute
  },

  /**
   * Read operations (GET requests)
   * More permissive limits for read-only operations
   */
  reads: {
    ttl: 60000, // 60 seconds
    limit: 100, // 100 requests per minute
  },

  /**
   * Mutation operations (POST, PATCH, PUT, DELETE)
   * Stricter limits to prevent abuse
   */
  mutations: {
    ttl: 60000, // 60 seconds
    limit: 10, // 10 requests per minute
  },

  /**
   * Search operations
   * Moderate limits for search endpoints
   */
  search: {
    ttl: 60000, // 60 seconds
    limit: 30, // 30 requests per minute
  },

  /**
   * Authentication operations
   * Very strict to prevent brute force attacks
   */
  auth: {
    ttl: 60000, // 60 seconds
    limit: 5, // 5 login attempts per minute
  },

  /**
   * Expensive operations (reports, exports, etc.)
   * Very strict to prevent resource exhaustion
   */
  expensive: {
    ttl: 300000, // 5 minutes
    limit: 3, // 3 requests per 5 minutes
  },
}));
