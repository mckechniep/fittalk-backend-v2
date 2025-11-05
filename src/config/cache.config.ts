import { registerAs } from '@nestjs/config';

/**
 * Cache Configuration
 *
 * Centralized cache key definitions and TTL values.
 * Prevents hard-coded cache keys scattered throughout the codebase.
 *
 * Usage:
 * ```typescript
 * constructor(
 *   private configService: ConfigService,
 *   @Inject(CACHE_MANAGER) private cacheManager: Cache
 * ) {}
 *
 * const key = this.configService.get<string>('cache.keys.foodItems');
 * await this.cacheManager.del(key);
 * ```
 */
export default registerAs('cache', () => ({
  /**
   * Cache Keys
   * Centralized definition of all cache keys used in the application
   */
  keys: {
    // Nutrition module cache keys
    foodItems: 'food-items-all',
    foodItemSearch: (search: string) => `food-items-search:${search}`,
    foodItemById: (id: string) => `food-item:${id}`,
    mealLogs: (userId: string, page: number) => `meal-logs:${userId}:page-${page}`,
    macroTargets: (userId: string) => `macro-targets:${userId}`,
    groceryLists: (userId: string) => `grocery-lists:${userId}`,

    // Workout module cache keys
    workoutPlans: (userId: string) => `workout-plans:${userId}`,
    exercises: 'exercises-all',
    exerciseById: (id: string) => `exercise:${id}`,

    // Consultation module cache keys
    consultationQuestions: 'consultation-questions-active',
    availabilityWindows: (userId: string) => `availability:${userId}`,
  },

  /**
   * Cache TTL (Time To Live) in seconds
   * Defines how long cached data should be retained
   */
  ttl: {
    // Static data that rarely changes
    exercises: 3600, // 1 hour
    consultationQuestions: 3600, // 1 hour

    // User-specific data with moderate change frequency
    foodItems: 1800, // 30 minutes
    workoutPlans: 1800, // 30 minutes
    macroTargets: 1800, // 30 minutes

    // Frequently changing data
    mealLogs: 300, // 5 minutes
    groceryLists: 300, // 5 minutes
    availabilityWindows: 300, // 5 minutes
  },
}));
