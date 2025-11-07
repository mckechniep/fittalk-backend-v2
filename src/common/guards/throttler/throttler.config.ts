/**
 * Centralized Rate Limiting Configuration
 *
 * This file defines all rate limits for the FitTalk API.
 * Rate limits are organized by risk level and operation type.
 *
 * TTL: Time-to-live in milliseconds (window size)
 * Limit: Maximum number of requests within the TTL window
 *
 * Production considerations:
 * - These limits are conservative and production-ready
 * - Monitor actual usage patterns and adjust as needed
 * - Consider implementing user-tier based limits (free vs premium)
 */

export interface ThrottleConfig {
  ttl: number;  // milliseconds
  limit: number; // requests
}

/**
 * Rate limit configurations organized by category
 */
export const RATE_LIMITS = {
  // ==================== HIGH RISK OPERATIONS ====================
  // Critical operations that can affect account security or system resources

  /**
   * Session revocation - HIGH RISK
   * Used when user logs out specific sessions
   */
  AUTH_SESSION_REVOKE: { ttl: 60000, limit: 5 } as ThrottleConfig,

  /**
   * Revoke all sessions - CRITICAL RISK
   * Nuclear option that logs user out everywhere
   */
  AUTH_SESSION_REVOKE_ALL: { ttl: 60000, limit: 3 } as ThrottleConfig,

  /**
   * Program deletion - HIGH RISK
   * Cascading delete of plan, days, and items
   */
  PROGRAM_DELETE: { ttl: 60000, limit: 5 } as ThrottleConfig,

  /**
   * Program cloning - EXPENSIVE OPERATION
   * Deep copy of entire program structure
   */
  PROGRAM_CLONE: { ttl: 60000, limit: 5 } as ThrottleConfig,

  /**
   * Schedule generation - COMPUTATIONALLY EXPENSIVE
   * Backtracking algorithm for week scheduling
   */
  SCHEDULE_GENERATION: { ttl: 60000, limit: 5 } as ThrottleConfig,

  /**
   * Live session termination - HIGH RISK
   * Ends active workout session permanently
   */
  LIVE_SESSION_END: { ttl: 60000, limit: 5 } as ThrottleConfig,

  // ==================== MEDIUM RISK OPERATIONS ====================
  // Standard CRUD mutations

  /**
   * Standard mutations - CREATE operations
   * New resources being created
   */
  STANDARD_CREATE: { ttl: 60000, limit: 10 } as ThrottleConfig,

  /**
   * Standard mutations - UPDATE operations
   * Existing resources being modified
   */
  STANDARD_UPDATE: { ttl: 60000, limit: 10 } as ThrottleConfig,

  /**
   * Standard mutations - DELETE operations
   * Resources being removed
   */
  STANDARD_DELETE: { ttl: 60000, limit: 10 } as ThrottleConfig,

  /**
   * Frequent mutations
   * Operations expected to happen more frequently during normal use
   * Examples: Updating workout day details, adding exercises to plan
   */
  FREQUENT_MUTATION: { ttl: 60000, limit: 20 } as ThrottleConfig,

  /**
   * High-frequency mutations
   * Operations that happen very frequently during active use
   * Examples: Meal logging, grocery item updates, consultation answers
   */
  HIGH_FREQUENCY_MUTATION: { ttl: 60000, limit: 30 } as ThrottleConfig,

  // ==================== LIVE WORKOUT OPERATIONS ====================
  // Real-time session management requires higher limits

  /**
   * Heartbeat - Keep-alive signals
   * Sent every 30-60 seconds during active workout
   */
  LIVE_HEARTBEAT: { ttl: 60000, limit: 120 } as ThrottleConfig,

  /**
   * Set completion
   * User completes a set during workout
   */
  LIVE_SET_COMPLETION: { ttl: 60000, limit: 50 } as ThrottleConfig,

  /**
   * Rest period end
   * User ends rest timer and returns to exercising
   */
  LIVE_REST_END: { ttl: 60000, limit: 50 } as ThrottleConfig,

  /**
   * State changes (pause/resume/start-exercise)
   * User controls workout flow
   */
  LIVE_STATE_CHANGE: { ttl: 60000, limit: 30 } as ThrottleConfig,

  /**
   * State queries
   * Frontend polling for session state
   */
  LIVE_STATE_QUERY: { ttl: 60000, limit: 120 } as ThrottleConfig,

  /**
   * Event emission
   * Generic event tracking during workout
   */
  LIVE_EVENT_EMIT: { ttl: 60000, limit: 20 } as ThrottleConfig,

  /**
   * Session creation
   * Starting a new live workout session
   */
  LIVE_SESSION_CREATE: { ttl: 60000, limit: 15 } as ThrottleConfig,

  // ==================== READ OPERATIONS ====================
  // GET endpoints with different access patterns

  /**
   * Standard reads
   * Normal GET operations for user data
   */
  STANDARD_READ: { ttl: 60000, limit: 60 } as ThrottleConfig,

  /**
   * Frequent reads
   * High-traffic read endpoints
   * Examples: Current user, session list, active workout state
   */
  FREQUENT_READ: { ttl: 60000, limit: 100 } as ThrottleConfig,

  /**
   * Health checks
   * Monitoring endpoints that should almost never be throttled
   */
  HEALTH_CHECK: { ttl: 60000, limit: 300 } as ThrottleConfig,

  // ==================== CONSULTATION & ONBOARDING ====================

  /**
   * Consultation answer submission
   * User answering onboarding questions
   */
  CONSULTATION_ANSWER: { ttl: 60000, limit: 30 } as ThrottleConfig,

  /**
   * Consultation completion
   * Finalizing onboarding session
   */
  CONSULTATION_COMPLETE: { ttl: 60000, limit: 5 } as ThrottleConfig,

  // ==================== WEBSOCKET EVENTS ====================
  // WebSocket-specific rate limits for live workout gateway

  /**
   * Join session room (WebSocket)
   * User joins a live workout session via WebSocket
   */
  WS_SESSION_JOIN: { ttl: 60000, limit: 30 } as ThrottleConfig,

  /**
   * Leave session room (WebSocket)
   * User leaves a live workout session
   */
  WS_SESSION_LEAVE: { ttl: 60000, limit: 30 } as ThrottleConfig,

  /**
   * Start exercise (WebSocket)
   * User starts a new exercise in live session
   */
  WS_START_EXERCISE: { ttl: 60000, limit: 30 } as ThrottleConfig,

  /**
   * Complete set (WebSocket)
   * User completes a set during live workout
   */
  WS_COMPLETE_SET: { ttl: 60000, limit: 50 } as ThrottleConfig,

  /**
   * End rest (WebSocket)
   * User ends rest period between sets
   */
  WS_END_REST: { ttl: 60000, limit: 50 } as ThrottleConfig,

  /**
   * Pause session (WebSocket)
   * User pauses active workout
   */
  WS_PAUSE_SESSION: { ttl: 60000, limit: 30 } as ThrottleConfig,

  /**
   * Resume session (WebSocket)
   * User resumes paused workout
   */
  WS_RESUME_SESSION: { ttl: 60000, limit: 30 } as ThrottleConfig,

  /**
   * End session (WebSocket)
   * User completes/ends the workout session
   */
  WS_END_SESSION: { ttl: 60000, limit: 10 } as ThrottleConfig,

  /**
   * Emit custom event (WebSocket)
   * User emits custom event to session participants
   */
  WS_EMIT_EVENT: { ttl: 60000, limit: 20 } as ThrottleConfig,

  /**
   * Heartbeat (WebSocket)
   * Keep-alive ping every 30-60 seconds
   */
  WS_HEARTBEAT: { ttl: 60000, limit: 120 } as ThrottleConfig,

  /**
   * Get state snapshot (WebSocket)
   * Request current session state
   */
  WS_GET_STATE: { ttl: 60000, limit: 120 } as ThrottleConfig,

  // ==================== ADMIN ENDPOINTS ====================
  // Admin-specific rate limits for system management

  /**
   * Admin: Get all users (with pagination)
   * View user list with filters
   */
  ADMIN_LIST_USERS: { ttl: 60000, limit: 30 } as ThrottleConfig,

  /**
   * Admin: Get user details
   * View detailed user information
   */
  ADMIN_GET_USER: { ttl: 60000, limit: 100 } as ThrottleConfig,

  /**
   * Admin: Suspend user
   * Restrict user access
   */
  ADMIN_SUSPEND_USER: { ttl: 60000, limit: 10 } as ThrottleConfig,

  /**
   * Admin: Unsuspend user
   * Restore user access
   */
  ADMIN_UNSUSPEND_USER: { ttl: 60000, limit: 10 } as ThrottleConfig,

  /**
   * Admin: Update user role
   * Promote/demote user roles
   */
  ADMIN_UPDATE_ROLE: { ttl: 60000, limit: 10 } as ThrottleConfig,

  /**
   * Admin: Delete user
   * Permanently remove user
   */
  ADMIN_DELETE_USER: { ttl: 60000, limit: 5 } as ThrottleConfig,

  /**
   * Admin: Get system statistics
   * View dashboard metrics
   */
  ADMIN_GET_STATS: { ttl: 60000, limit: 60 } as ThrottleConfig,

  /**
   * Admin: Search audit logs
   * View system audit trails
   */
  ADMIN_AUDIT_LOGS: { ttl: 60000, limit: 50 } as ThrottleConfig,

  // ==================== SUPPORT ENDPOINTS ====================
  // Support team rate limits for ticket management

  /**
   * Support: List tickets
   * View all support tickets
   */
  SUPPORT_LIST_TICKETS: { ttl: 60000, limit: 100 } as ThrottleConfig,

  /**
   * Support: Get ticket details
   * View single ticket
   */
  SUPPORT_GET_TICKET: { ttl: 60000, limit: 100 } as ThrottleConfig,

  /**
   * Support: Create ticket (user-facing)
   * Users creating new tickets
   */
  SUPPORT_CREATE_TICKET: { ttl: 60000, limit: 5 } as ThrottleConfig,

  /**
   * Support: Update ticket
   * Change ticket status/priority/assignment
   */
  SUPPORT_UPDATE_TICKET: { ttl: 60000, limit: 30 } as ThrottleConfig,

  /**
   * Support: Add message to ticket
   * Reply to ticket
   */
  SUPPORT_ADD_MESSAGE: { ttl: 60000, limit: 50 } as ThrottleConfig,

  /**
   * Support: Close ticket
   * Mark ticket as closed
   */
  SUPPORT_CLOSE_TICKET: { ttl: 60000, limit: 30 } as ThrottleConfig,

} as const;

/**
 * Helper type for type-safe rate limit keys
 */
export type RateLimitKey = keyof typeof RATE_LIMITS;

/**
 * Get rate limit configuration by key
 */
export function getRateLimit(key: RateLimitKey): ThrottleConfig {
  return RATE_LIMITS[key];
}

/**
 * Environment-based overrides
 * In development, you might want more lenient limits for testing
 */
export function getEnvironmentAdjustedLimit(
  config: ThrottleConfig,
  environment: 'development' | 'production' | 'test',
): ThrottleConfig {
  if (environment === 'development') {
    // 10x limits in development
    return {
      ttl: config.ttl,
      limit: config.limit * 10,
    };
  }

  if (environment === 'test') {
    // Effectively unlimited in tests
    return {
      ttl: config.ttl,
      limit: 99999,
    };
  }

  // Production uses configured limits
  return config;
}
