import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { RATE_LIMITS, type RateLimitKey } from './throttler.config';

/**
 * Custom Rate Limiting Decorators
 *
 * These decorators provide semantic, type-safe rate limiting
 * across the application. They use the centralized configuration
 * from throttler.config.ts.
 *
 * Usage:
 * @HighRiskEndpoint() - For critical operations (5/min)
 * @StandardMutation() - For normal CRUD operations (10/min)
 * @ReadEndpoint() - For GET operations (60/min)
 * @LiveWorkoutEndpoint('heartbeat') - For live workout operations
 *
 * Benefits:
 * - Self-documenting code
 * - Type-safe (TypeScript will catch typos)
 * - Centralized rate limit management
 * - Easy to adjust limits globally
 */

// ==================== HIGH RISK DECORATORS ====================

/**
 * High Risk Endpoint
 * For critical operations that can affect account security or system resources
 * Default: 5 requests per minute
 */
export const HighRiskEndpoint = () =>
  Throttle({ default: RATE_LIMITS.AUTH_SESSION_REVOKE });

/**
 * Critical Risk Endpoint
 * For nuclear options like revoking all sessions
 * Default: 3 requests per minute
 */
export const CriticalRiskEndpoint = () =>
  Throttle({ default: RATE_LIMITS.AUTH_SESSION_REVOKE_ALL });

/**
 * Expensive Operation
 * For computationally expensive operations
 * Default: 5 requests per minute
 * Examples: Schedule generation, program cloning
 */
export const ExpensiveOperation = () =>
  Throttle({ default: RATE_LIMITS.SCHEDULE_GENERATION });

// ==================== MUTATION DECORATORS ====================

/**
 * Standard Create Operation
 * For creating new resources
 * Default: 10 requests per minute
 */
export const StandardCreate = () =>
  Throttle({ default: RATE_LIMITS.STANDARD_CREATE });

/**
 * Standard Update Operation
 * For updating existing resources
 * Default: 10 requests per minute
 */
export const StandardUpdate = () =>
  Throttle({ default: RATE_LIMITS.STANDARD_UPDATE });

/**
 * Standard Delete Operation
 * For deleting resources
 * Default: 10 requests per minute
 */
export const StandardDelete = () =>
  Throttle({ default: RATE_LIMITS.STANDARD_DELETE });

/**
 * Frequent Mutation
 * For operations expected to happen more frequently
 * Default: 20 requests per minute
 * Examples: Updating workout details, modifying exercises
 */
export const FrequentMutation = () =>
  Throttle({ default: RATE_LIMITS.FREQUENT_MUTATION });

/**
 * High Frequency Mutation
 * For very frequent operations during active use
 * Default: 30 requests per minute
 * Examples: Meal logging, consultation answers
 */
export const HighFrequencyMutation = () =>
  Throttle({ default: RATE_LIMITS.HIGH_FREQUENCY_MUTATION });

// ==================== READ DECORATORS ====================

/**
 * Standard Read Endpoint
 * For normal GET operations
 * Default: 60 requests per minute
 */
export const ReadEndpoint = () =>
  Throttle({ default: RATE_LIMITS.STANDARD_READ });

/**
 * Frequent Read Endpoint
 * For high-traffic read endpoints
 * Default: 100 requests per minute
 * Examples: Current user, session list
 */
export const FrequentRead = () =>
  Throttle({ default: RATE_LIMITS.FREQUENT_READ });

/**
 * Health Check Endpoint
 * For monitoring endpoints that should almost never be throttled
 * Default: 300 requests per minute
 */
export const HealthCheckEndpoint = () =>
  Throttle({ default: RATE_LIMITS.HEALTH_CHECK });

// ==================== LIVE WORKOUT DECORATORS ====================

/**
 * Live Workout Endpoint
 * Configures rate limits for specific live workout operations
 *
 * @param operationType - Type of live workout operation
 * - 'heartbeat': 120/min (every 30s)
 * - 'set': 50/min (completing sets)
 * - 'rest': 50/min (ending rest periods)
 * - 'state': 30/min (pause/resume/start)
 * - 'query': 120/min (state queries)
 * - 'event': 20/min (event emission)
 * - 'create': 15/min (session creation)
 * - 'end': 5/min (session termination)
 */
export const LiveWorkoutEndpoint = (
  operationType:
    | 'heartbeat'
    | 'set'
    | 'rest'
    | 'state'
    | 'query'
    | 'event'
    | 'create'
    | 'end',
) => {
  const limits = {
    heartbeat: RATE_LIMITS.LIVE_HEARTBEAT,
    set: RATE_LIMITS.LIVE_SET_COMPLETION,
    rest: RATE_LIMITS.LIVE_REST_END,
    state: RATE_LIMITS.LIVE_STATE_CHANGE,
    query: RATE_LIMITS.LIVE_STATE_QUERY,
    event: RATE_LIMITS.LIVE_EVENT_EMIT,
    create: RATE_LIMITS.LIVE_SESSION_CREATE,
    end: RATE_LIMITS.LIVE_SESSION_END,
  };

  return Throttle({ default: limits[operationType] });
};

// ==================== CONSULTATION DECORATORS ====================

/**
 * Consultation Answer Endpoint
 * For submitting answers during onboarding
 * Default: 30 requests per minute
 */
export const ConsultationAnswer = () =>
  Throttle({ default: RATE_LIMITS.CONSULTATION_ANSWER });

/**
 * Consultation Complete Endpoint
 * For finalizing consultation session
 * Default: 5 requests per minute
 */
export const ConsultationComplete = () =>
  Throttle({ default: RATE_LIMITS.CONSULTATION_COMPLETE });

// ==================== UTILITY DECORATORS ====================

/**
 * Custom Rate Limit
 * For endpoints that need specific, non-standard limits
 *
 * @param ttl - Time window in milliseconds
 * @param limit - Maximum requests in window
 */
export const CustomRateLimit = (ttl: number, limit: number) =>
  Throttle({ default: { ttl, limit } });

/**
 * Skip Throttle
 * Disables rate limiting for specific endpoint
 * Use sparingly - most endpoints should have some limit
 */
export const NoRateLimit = () => SkipThrottle();

/**
 * Apply Rate Limit by Key
 * For programmatic rate limit application using config keys
 *
 * @param key - Rate limit configuration key
 */
export const ApplyRateLimit = (key: RateLimitKey) =>
  Throttle({ default: RATE_LIMITS[key] });

// ==================== ADMIN ENDPOINT DECORATORS ====================

/**
 * Admin: List Users
 * For paginated user listing endpoints
 */
export const AdminListUsers = () =>
  Throttle({ default: RATE_LIMITS.ADMIN_LIST_USERS });

/**
 * Admin: Get User Details
 * For viewing detailed user information
 */
export const AdminGetUser = () =>
  Throttle({ default: RATE_LIMITS.ADMIN_GET_USER });

/**
 * Admin: Suspend User
 * For suspending user accounts
 */
export const AdminSuspendUser = () =>
  Throttle({ default: RATE_LIMITS.ADMIN_SUSPEND_USER });

/**
 * Admin: Unsuspend User
 * For restoring suspended accounts
 */
export const AdminUnsuspendUser = () =>
  Throttle({ default: RATE_LIMITS.ADMIN_UNSUSPEND_USER });

/**
 * Admin: Update User Role
 * For changing user roles
 */
export const AdminUpdateRole = () =>
  Throttle({ default: RATE_LIMITS.ADMIN_UPDATE_ROLE });

/**
 * Admin: Delete User
 * For permanently deleting users
 */
export const AdminDeleteUser = () =>
  Throttle({ default: RATE_LIMITS.ADMIN_DELETE_USER });

/**
 * Admin: Get Statistics
 * For system dashboard and metrics
 */
export const AdminGetStats = () =>
  Throttle({ default: RATE_LIMITS.ADMIN_GET_STATS });

/**
 * Admin: Audit Logs
 * For viewing system audit trails
 */
export const AdminAuditLogs = () =>
  Throttle({ default: RATE_LIMITS.ADMIN_AUDIT_LOGS });

// ==================== SUPPORT ENDPOINT DECORATORS ====================

/**
 * Support: List Tickets
 * For viewing all support tickets
 */
export const SupportListTickets = () =>
  Throttle({ default: RATE_LIMITS.SUPPORT_LIST_TICKETS });

/**
 * Support: Get Ticket
 * For viewing single ticket details
 */
export const SupportGetTicket = () =>
  Throttle({ default: RATE_LIMITS.SUPPORT_GET_TICKET });

/**
 * Support: Create Ticket
 * For users creating new support tickets
 */
export const SupportCreateTicket = () =>
  Throttle({ default: RATE_LIMITS.SUPPORT_CREATE_TICKET });

/**
 * Support: Update Ticket
 * For modifying ticket status/priority/assignment
 */
export const SupportUpdateTicket = () =>
  Throttle({ default: RATE_LIMITS.SUPPORT_UPDATE_TICKET });

/**
 * Support: Add Message
 * For replying to tickets
 */
export const SupportAddMessage = () =>
  Throttle({ default: RATE_LIMITS.SUPPORT_ADD_MESSAGE });

/**
 * Support: Close Ticket
 * For closing resolved tickets
 */
export const SupportCloseTicket = () =>
  Throttle({ default: RATE_LIMITS.SUPPORT_CLOSE_TICKET });
