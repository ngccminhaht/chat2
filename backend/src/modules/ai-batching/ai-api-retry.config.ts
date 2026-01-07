/**
 * Retry Configuration for AI API Calls
 * Implements exponential backoff with detailed error categorization
 */

export interface AIRetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  timeoutMs: number;
}

export const DEFAULT_AI_RETRY_CONFIG: AIRetryConfig = {
  maxRetries: 3,
  initialDelayMs: 2000, // 2s initial delay
  maxDelayMs: 30000, // 30s max delay
  backoffMultiplier: 2,
  timeoutMs: 60000, // 60s timeout for AI API
};

// HTTP status codes that warrant a retry
export const AI_RETRYABLE_STATUS_CODES = [
  408, // Request Timeout
  429, // Too Many Requests (rate limiting)
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
];

// HTTP status codes that should fail immediately (client errors)
export const AI_NON_RETRYABLE_STATUS_CODES = [
  400, // Bad Request
  401, // Unauthorized (invalid API key)
  403, // Forbidden
  404, // Not Found
  422, // Unprocessable Entity
];

/**
 * Error types for AI API calls
 */
export enum AIErrorType {
  NETWORK_ERROR = "NETWORK_ERROR",
  TIMEOUT_ERROR = "TIMEOUT_ERROR",
  RATE_LIMIT_ERROR = "RATE_LIMIT_ERROR",
  SERVER_ERROR = "SERVER_ERROR",
  AUTH_ERROR = "AUTH_ERROR",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  PARSE_ERROR = "PARSE_ERROR",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

/**
 * AI API Error with detailed context
 */
export class AIAPIError extends Error {
  constructor(
    message: string,
    public readonly type: AIErrorType,
    public readonly statusCode?: number,
    public readonly responseData?: any,
    public readonly requestData?: any,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = "AIAPIError";
  }
}

/**
 * Calculate exponential backoff delay for AI API retries
 */
export function calculateAIBackoff(
  retryCount: number,
  config: AIRetryConfig = DEFAULT_AI_RETRY_CONFIG
): number {
  const delay =
    config.initialDelayMs * Math.pow(config.backoffMultiplier, retryCount);
  return Math.min(delay, config.maxDelayMs);
}

/**
 * Check if HTTP status code is retryable
 */
export function isAIRetryableStatus(statusCode: number): boolean {
  return AI_RETRYABLE_STATUS_CODES.includes(statusCode);
}

/**
 * Extract and categorize error from AI API call
 */
export function categorizeAIError(error: any): AIAPIError {
  // Network errors (no response received)
  if (
    error.code === "ECONNREFUSED" ||
    error.code === "ENOTFOUND" ||
    error.code === "ECONNRESET"
  ) {
    return new AIAPIError(
      `Network error: ${error.message}`,
      AIErrorType.NETWORK_ERROR,
      undefined,
      undefined,
      undefined,
      true // retryable
    );
  }

  // Timeout errors
  if (
    error.code === "ETIMEDOUT" ||
    error.code === "ECONNABORTED" ||
    error.message?.includes("timeout")
  ) {
    return new AIAPIError(
      `Timeout error: ${error.message}`,
      AIErrorType.TIMEOUT_ERROR,
      408,
      undefined,
      undefined,
      true // retryable
    );
  }

  // HTTP errors with response
  if (error.response) {
    const statusCode = error.response.status;
    const responseData = error.response.data;
    const requestData = error.config?.data;

    // Rate limiting
    if (statusCode === 429) {
      const retryAfter = error.response.headers["retry-after"];
      return new AIAPIError(
        `Rate limit exceeded${
          retryAfter ? ` (retry after ${retryAfter}s)` : ""
        }`,
        AIErrorType.RATE_LIMIT_ERROR,
        statusCode,
        responseData,
        requestData,
        true // retryable
      );
    }

    // Server errors (5xx)
    if (statusCode >= 500) {
      return new AIAPIError(
        `Server error: ${statusCode} - ${JSON.stringify(responseData)}`,
        AIErrorType.SERVER_ERROR,
        statusCode,
        responseData,
        requestData,
        true // retryable
      );
    }

    // Auth errors
    if (statusCode === 401 || statusCode === 403) {
      return new AIAPIError(
        `Authentication error: ${statusCode} - ${JSON.stringify(responseData)}`,
        AIErrorType.AUTH_ERROR,
        statusCode,
        responseData,
        requestData,
        false // not retryable
      );
    }

    // Validation errors
    if (statusCode === 400 || statusCode === 422) {
      return new AIAPIError(
        `Validation error: ${statusCode} - ${JSON.stringify(responseData)}`,
        AIErrorType.VALIDATION_ERROR,
        statusCode,
        responseData,
        requestData,
        false // not retryable
      );
    }

    // Other client errors
    if (statusCode >= 400 && statusCode < 500) {
      return new AIAPIError(
        `Client error: ${statusCode} - ${JSON.stringify(responseData)}`,
        AIErrorType.VALIDATION_ERROR,
        statusCode,
        responseData,
        requestData,
        false // not retryable
      );
    }
  }

  // Unknown error
  return new AIAPIError(
    `Unknown error: ${error.message}`,
    AIErrorType.UNKNOWN_ERROR,
    undefined,
    error.response?.data,
    error.config?.data,
    true // retry by default for unknown errors
  );
}

/**
 * Sleep utility for retry delays
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
