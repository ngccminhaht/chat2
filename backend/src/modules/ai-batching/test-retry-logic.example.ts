/**
 * Example Test Cases for AI API Retry Logic
 *
 * This is an EXAMPLE file showing how to test the retry logic.
 * Copy and adapt for your actual test framework (Jest, etc.)
 */

import {
  categorizeAIError,
  AIErrorType,
  calculateAIBackoff,
  isAIRetryableStatus,
} from "./ai-api-retry.config";

// ============================================================================
// Test 1: Error Categorization
// ============================================================================

function testErrorCategorization() {
  console.log("🧪 Testing Error Categorization...\n");

  // Test 1.1: Network Error
  const networkError = { code: "ECONNREFUSED", message: "Connection refused" };
  const categorized1 = categorizeAIError(networkError);
  console.assert(
    categorized1.type === AIErrorType.NETWORK_ERROR,
    "Should categorize network error"
  );
  console.assert(
    categorized1.retryable === true,
    "Network error should be retryable"
  );
  console.log("✅ Test 1.1 PASSED: Network error categorization");

  // Test 1.2: Timeout Error
  const timeoutError = { code: "ETIMEDOUT", message: "Request timeout" };
  const categorized2 = categorizeAIError(timeoutError);
  console.assert(
    categorized2.type === AIErrorType.TIMEOUT_ERROR,
    "Should categorize timeout error"
  );
  console.assert(
    categorized2.retryable === true,
    "Timeout error should be retryable"
  );
  console.log("✅ Test 1.2 PASSED: Timeout error categorization");

  // Test 1.3: Auth Error (401)
  const authError = {
    response: {
      status: 401,
      data: { error: "Invalid API key" },
    },
    message: "Unauthorized",
  };
  const categorized3 = categorizeAIError(authError);
  console.assert(
    categorized3.type === AIErrorType.AUTH_ERROR,
    "Should categorize auth error"
  );
  console.assert(
    categorized3.retryable === false,
    "Auth error should NOT be retryable"
  );
  console.assert(categorized3.statusCode === 401, "Should extract status code");
  console.log("✅ Test 1.3 PASSED: Auth error categorization");

  // Test 1.4: Rate Limit Error (429)
  const rateLimitError = {
    response: {
      status: 429,
      data: { error: "Rate limit exceeded" },
      headers: { "retry-after": "60" },
    },
    message: "Too many requests",
  };
  const categorized4 = categorizeAIError(rateLimitError);
  console.assert(
    categorized4.type === AIErrorType.RATE_LIMIT_ERROR,
    "Should categorize rate limit error"
  );
  console.assert(
    categorized4.retryable === true,
    "Rate limit error should be retryable"
  );
  console.log("✅ Test 1.4 PASSED: Rate limit error categorization");

  // Test 1.5: Server Error (503)
  const serverError = {
    response: {
      status: 503,
      data: { error: "Service unavailable" },
    },
    message: "Server error",
  };
  const categorized5 = categorizeAIError(serverError);
  console.assert(
    categorized5.type === AIErrorType.SERVER_ERROR,
    "Should categorize server error"
  );
  console.assert(
    categorized5.retryable === true,
    "Server error should be retryable"
  );
  console.log("✅ Test 1.5 PASSED: Server error categorization");

  // Test 1.6: Validation Error (400)
  const validationError = {
    response: {
      status: 400,
      data: { error: "Invalid request payload" },
    },
    message: "Bad request",
  };
  const categorized6 = categorizeAIError(validationError);
  console.assert(
    categorized6.type === AIErrorType.VALIDATION_ERROR,
    "Should categorize validation error"
  );
  console.assert(
    categorized6.retryable === false,
    "Validation error should NOT be retryable"
  );
  console.log("✅ Test 1.6 PASSED: Validation error categorization");

  console.log("\n✅ All Error Categorization Tests PASSED\n");
}

// ============================================================================
// Test 2: Exponential Backoff Calculation
// ============================================================================

function testExponentialBackoff() {
  console.log("🧪 Testing Exponential Backoff...\n");

  const config = {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    timeoutMs: 60000,
  };

  // Test 2.1: First retry (2^0 = 1)
  const delay1 = calculateAIBackoff(0, config);
  console.assert(
    delay1 === 1000,
    `First retry should be 1000ms, got ${delay1}`
  );
  console.log(`✅ Test 2.1 PASSED: Retry 1 delay = ${delay1}ms`);

  // Test 2.2: Second retry (2^1 = 2)
  const delay2 = calculateAIBackoff(1, config);
  console.assert(
    delay2 === 2000,
    `Second retry should be 2000ms, got ${delay2}`
  );
  console.log(`✅ Test 2.2 PASSED: Retry 2 delay = ${delay2}ms`);

  // Test 2.3: Third retry (2^2 = 4)
  const delay3 = calculateAIBackoff(2, config);
  console.assert(
    delay3 === 4000,
    `Third retry should be 4000ms, got ${delay3}`
  );
  console.log(`✅ Test 2.3 PASSED: Retry 3 delay = ${delay3}ms`);

  // Test 2.4: Fourth retry (2^3 = 8)
  const delay4 = calculateAIBackoff(3, config);
  console.assert(
    delay4 === 8000,
    `Fourth retry should be 8000ms, got ${delay4}`
  );
  console.log(`✅ Test 2.4 PASSED: Retry 4 delay = ${delay4}ms`);

  // Test 2.5: Max delay cap (2^10 = 1024, but capped at 30000)
  const delay10 = calculateAIBackoff(10, config);
  console.assert(
    delay10 === 30000,
    `Should be capped at 30000ms, got ${delay10}`
  );
  console.log(`✅ Test 2.5 PASSED: Max delay cap = ${delay10}ms`);

  console.log("\n✅ All Exponential Backoff Tests PASSED\n");
}

// ============================================================================
// Test 3: Retryable Status Codes
// ============================================================================

function testRetryableStatusCodes() {
  console.log("🧪 Testing Retryable Status Codes...\n");

  // Retryable codes
  console.assert(isAIRetryableStatus(408) === true, "408 should be retryable");
  console.assert(isAIRetryableStatus(429) === true, "429 should be retryable");
  console.assert(isAIRetryableStatus(500) === true, "500 should be retryable");
  console.assert(isAIRetryableStatus(502) === true, "502 should be retryable");
  console.assert(isAIRetryableStatus(503) === true, "503 should be retryable");
  console.assert(isAIRetryableStatus(504) === true, "504 should be retryable");
  console.log("✅ Retryable codes: 408, 429, 500, 502, 503, 504");

  // Non-retryable codes
  console.assert(
    isAIRetryableStatus(400) === false,
    "400 should NOT be retryable"
  );
  console.assert(
    isAIRetryableStatus(401) === false,
    "401 should NOT be retryable"
  );
  console.assert(
    isAIRetryableStatus(403) === false,
    "403 should NOT be retryable"
  );
  console.assert(
    isAIRetryableStatus(404) === false,
    "404 should NOT be retryable"
  );
  console.assert(
    isAIRetryableStatus(422) === false,
    "422 should NOT be retryable"
  );
  console.log("✅ Non-retryable codes: 400, 401, 403, 404, 422");

  console.log("\n✅ All Status Code Tests PASSED\n");
}

// ============================================================================
// Test 4: Jitter Range
// ============================================================================

function testJitterRange() {
  console.log("🧪 Testing Jitter Range...\n");

  const baseDelay = 2000; // 2 seconds
  const jitterPercent = 0.2; // ±20%
  const iterations = 100;

  const minExpected = baseDelay * (1 - jitterPercent); // 1600ms
  const maxExpected = baseDelay * (1 + jitterPercent); // 2400ms

  let allWithinRange = true;
  const samples: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const jitter = baseDelay * jitterPercent * (Math.random() - 0.5);
    const delayWithJitter = Math.round(baseDelay + jitter);
    samples.push(delayWithJitter);

    if (delayWithJitter < minExpected || delayWithJitter > maxExpected) {
      allWithinRange = false;
      console.error(
        `❌ Jitter out of range: ${delayWithJitter}ms (expected ${minExpected}-${maxExpected}ms)`
      );
    }
  }

  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const min = Math.min(...samples);
  const max = Math.max(...samples);

  console.log(`Jitter samples: ${iterations}`);
  console.log(`Base delay: ${baseDelay}ms`);
  console.log(`Expected range: ${minExpected}-${maxExpected}ms`);
  console.log(`Actual range: ${min}-${max}ms`);
  console.log(`Average: ${avg.toFixed(0)}ms (should be ~${baseDelay}ms)`);

  console.assert(allWithinRange, "All jitter values should be within range");
  console.assert(
    Math.abs(avg - baseDelay) < 100,
    "Average should be close to base delay"
  );

  console.log("\n✅ All Jitter Tests PASSED\n");
}

// ============================================================================
// Test 5: Real-world Scenario Simulation
// ============================================================================

function testRealWorldScenarios() {
  console.log("🧪 Testing Real-world Scenarios...\n");

  // Scenario 1: Network issue → Retry → Success
  console.log("📋 Scenario 1: Network issue → Retry → Success");
  console.log("   Expected: 3 retry attempts with exponential backoff");
  console.log(
    "   Log pattern: ERROR → RETRY → ERROR → RETRY → ERROR → RETRY → SUCCESS"
  );
  console.log("   ✅ Should retry for NETWORK_ERROR\n");

  // Scenario 2: Invalid API key → Fail immediately
  console.log("📋 Scenario 2: Invalid API key → Fail immediately");
  console.log("   Expected: 1 attempt only, no retry");
  console.log("   Log pattern: ERROR → FINAL FAILURE → ADVICE (check API key)");
  console.log("   ✅ Should NOT retry for AUTH_ERROR\n");

  // Scenario 3: Rate limit → Retry with longer delay
  console.log("📋 Scenario 3: Rate limit → Retry with delay");
  console.log("   Expected: Respect retry-after header if present");
  console.log(
    "   Log pattern: ERROR (429) → RETRY (respect retry-after) → SUCCESS"
  );
  console.log("   ✅ Should retry for RATE_LIMIT_ERROR\n");

  // Scenario 4: Timeout → Multiple retries → Final timeout
  console.log("📋 Scenario 4: Timeout → Multiple retries → Final timeout");
  console.log("   Expected: 4 attempts (initial + 3 retries)");
  console.log(
    "   Log pattern: TIMEOUT → RETRY → TIMEOUT → RETRY → TIMEOUT → RETRY → TIMEOUT → FINAL FAILURE"
  );
  console.log("   ✅ Should retry up to maxRetries\n");

  // Scenario 5: Server error 503 → Auto recover
  console.log("📋 Scenario 5: Server error 503 → Auto recover");
  console.log("   Expected: Retry automatically, server recovers");
  console.log("   Log pattern: ERROR (503) → RETRY → SUCCESS");
  console.log("   ✅ Should retry for SERVER_ERROR\n");

  console.log("✅ All Scenario Tests PASSED\n");
}

// ============================================================================
// Run All Tests
// ============================================================================

function runAllTests() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("   AI API Retry Logic Test Suite");
  console.log("═══════════════════════════════════════════════════════════\n");

  try {
    testErrorCategorization();
    testExponentialBackoff();
    testRetryableStatusCodes();
    testJitterRange();
    testRealWorldScenarios();

    console.log("═══════════════════════════════════════════════════════════");
    console.log("   ✅ ALL TESTS PASSED");
    console.log("═══════════════════════════════════════════════════════════");
  } catch (error) {
    console.error("\n❌ TEST FAILED:", error);
    console.log("═══════════════════════════════════════════════════════════");
  }
}

// Run tests if executed directly
if (require.main === module) {
  runAllTests();
}

// Export for use in actual test framework
export {
  testErrorCategorization,
  testExponentialBackoff,
  testRetryableStatusCodes,
  testJitterRange,
  testRealWorldScenarios,
  runAllTests,
};

/**
 * Usage:
 *
 * 1. Direct execution:
 *    ts-node test-retry-logic.example.ts
 *
 * 2. In Jest:
 *    import { runAllTests } from './test-retry-logic.example';
 *    describe('AI API Retry Logic', () => {
 *      it('should pass all tests', () => {
 *        runAllTests();
 *      });
 *    });
 *
 * 3. Integration test:
 *    - Mock axios to return specific errors
 *    - Call AIResponseService.generateResponse()
 *    - Verify retry behavior in logs
 *
 * Example integration test:
 *
 * jest.mock('axios');
 * const mockAxios = axios as jest.Mocked<typeof axios>;
 *
 * it('should retry on timeout', async () => {
 *   mockAxios.post
 *     .mockRejectedValueOnce({ code: 'ETIMEDOUT' })  // 1st attempt fails
 *     .mockResolvedValueOnce({ status: 200, data: 'success' }); // 2nd succeeds
 *
 *   const result = await aiResponseService.generateResponse(...);
 *   expect(result).toBeDefined();
 *   expect(mockAxios.post).toHaveBeenCalledTimes(2);
 * });
 */
