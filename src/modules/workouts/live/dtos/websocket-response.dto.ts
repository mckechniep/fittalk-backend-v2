/**
 * Standard WebSocket response envelope.
 * Provides consistent structure for all WS messages sent to clients.
 */
export interface WebSocketResponseDto<T = any> {
  event: string;
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any; // Additional error context (e.g., rate limit metadata)
  };
  timestamp: number; // Unix timestamp in ms
}

/**
 * Helper to create success responses
 */
export function createWsSuccess<T>(event: string, data?: T): WebSocketResponseDto<T> {
  return {
    event,
    success: true,
    data,
    timestamp: Date.now(),
  };
}

/**
 * Helper to create error responses
 */
export function createWsError(
  event: string,
  code: string,
  message: string,
  details?: any,
): WebSocketResponseDto {
  return {
    event,
    success: false,
    error: { code, message, details },
    timestamp: Date.now(),
  };
}
