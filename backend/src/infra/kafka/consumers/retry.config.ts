/**
 * Retry Configuration for Outgoing Message Delivery
 * Implements exponential backoff with DLQ fallback
 */

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

// HTTP status codes that warrant a retry (server errors, rate limiting)
export const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];

// HTTP status codes that should fail immediately (client errors)
export const NON_RETRYABLE_STATUS_CODES = [400, 401, 403, 404];

/**
 * Calculate exponential backoff delay
 * Formula: initialDelay * (multiplier ^ retryCount), capped at maxDelay
 */
export function calculateBackoff(
  retryCount: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): number {
  const delay =
    config.initialDelayMs * Math.pow(config.backoffMultiplier, retryCount);
  return Math.min(delay, config.maxDelayMs);
}

/**
 * Check if HTTP status code is retryable
 */
export function isRetryableStatus(statusCode: number): boolean {
  return RETRYABLE_STATUS_CODES.includes(statusCode);
}

/**
 * Extract HTTP status code from error message or object
 */
export function extractStatusCode(error: string | Error | any): number {
  if (typeof error === 'number') return error;

  const errorStr = typeof error === 'string' ? error : error?.message || '';

  // Try to extract status code from common error patterns
  const statusMatch = errorStr.match(/status[:\s]*(\d{3})/i);
  if (statusMatch) return parseInt(statusMatch[1], 10);

  // Check for axios-style error response
  if (error?.response?.status) return error.response.status;

  // Default to 500 for unknown errors (retryable)
  return 500;
}
