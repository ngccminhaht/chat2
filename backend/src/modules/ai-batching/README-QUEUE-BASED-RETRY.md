# Queue-Based Retry for AI API Calls

## Overview

Thay vì implement retry logic trực tiếp trong code, chúng ta sử dụng **BullMQ queue system** để handle retry - giống như cách AI batching hoạt động.

## Architecture

```
Visitor Message
      │
      ▼
AI Batch Queue (debounce)
      │
      ▼
AI Batch Processor
      │
      ▼
AI API Call Queue ◄────────────┐
      │                        │
      ▼                        │ Retry (BullMQ)
AI API Call Processor          │
      │                        │
      ├─Success────────────────┘
      │
      └─Error (retryable)──────┘
```

## Components

### 1. AI API Call Queue (`ai-api-call.queue.ts`)

```typescript
export const AI_API_CALL_QUEUE = "ai-api-call";

export interface AIAPICallJobData {
  conversationId: string;
  organizationId: string;
  messageIds: string[];
  customerId?: string;
}
```

### 2. AI API Call Processor (`ai-api-call.processor.ts`)

- Gọi AI API **một lần duy nhất**
- Throw error nếu fail → BullMQ tự động retry
- Return non-retryable errors để ngăn retry không cần thiết

### 3. BullMQ Configuration (`ai-batching.module.ts`)

```typescript
BullModule.registerQueue({
  name: AI_API_CALL_QUEUE,
  defaultJobOptions: {
    attempts: 4, // 1 initial + 3 retries
    backoff: {
      type: "exponential",
      delay: 2000, // 2s initial delay
    },
    timeout: 60000, // 60s timeout per attempt
  },
});
```

## How It Works

### Success Case

```
1. AI Batch Processor → Add job to AI API Call Queue
2. AI API Call Processor → Call API
3. API returns success
4. Return result
5. AI Batch Processor receives result → Save message
```

### Retry Case (Network Error, Timeout, 5xx)

```
1. AI Batch Processor → Add job to AI API Call Queue
2. AI API Call Processor → Call API
3. API fails with retryable error (timeout, 5xx)
4. Processor throws error
5. BullMQ automatically schedules retry with exponential backoff
   - Retry 1: after ~2s
   - Retry 2: after ~4s
   - Retry 3: after ~8s
6. On success: Return result
7. On final failure: Job moves to failed queue
```

### Non-Retryable Case (Auth Error, Validation Error)

```
1. AI Batch Processor → Add job to AI API Call Queue
2. AI API Call Processor → Call API
3. API fails with non-retryable error (401, 400)
4. Processor categorizes error
5. Processor returns error result (not throw)
6. Job completes immediately (no retry)
7. AI Batch Processor handles gracefully
```

## Benefits vs Code-Based Retry

| Feature                  | Code-Based Retry              | Queue-Based Retry (Current) |
| ------------------------ | ----------------------------- | --------------------------- |
| **Separation of Concerns** | ❌ Mixed in service code      | ✅ Separated in processor   |
| **Persistent Retries**   | ❌ Lost on app restart        | ✅ Survives restarts        |
| **Monitoring**           | ❌ Only via logs              | ✅ BullMQ dashboard + logs  |
| **Configuration**        | ⚙️ Custom implementation      | ✅ Built-in BullMQ config   |
| **Retry State**          | ❌ In-memory only             | ✅ Persistent in Redis      |
| **Backoff Strategy**     | ⚙️ Manual implementation      | ✅ Built-in exponential     |
| **Failed Job Management**| ❌ Lost                       | ✅ Kept in failed queue     |
| **Distributed**          | ❌ Not scalable               | ✅ Multiple workers         |
| **Idempotency**          | ⚙️ Must implement manually    | ✅ Job IDs prevent duplicates|

## Retry Configuration

### Default Config

```typescript
const DEFAULT_AI_RETRY_CONFIG = {
  maxRetries: 3, // Total 4 attempts (1 + 3)
  initialDelayMs: 2000, // 2s initial delay
  maxDelayMs: 30000, // 30s max delay
  backoffMultiplier: 2, // Exponential: 2x each time
  timeoutMs: 60000, // 60s per attempt
};
```

### BullMQ Backoff

```typescript
backoff: {
  type: 'exponential',
  delay: 2000,  // Base delay
}

// Results in:
// Retry 1: ~2s   (2000ms)
// Retry 2: ~4s   (4000ms)
// Retry 3: ~8s   (8000ms)
// Retry 4: ~16s  (but capped at maxDelayMs: 30s)
```

## Error Handling Strategy

### Retryable Errors (Throw to trigger retry)

```typescript
// Network errors
if (error.code === "ECONNREFUSED") {
  throw error; // BullMQ will retry
}

// Timeout errors
if (error.code === "ETIMEDOUT") {
  throw error; // BullMQ will retry
}

// Server errors (5xx)
if (statusCode >= 500) {
  throw error; // BullMQ will retry
}

// Rate limit (429)
if (statusCode === 429) {
  throw error; // BullMQ will retry
}
```

### Non-Retryable Errors (Return to prevent retry)

```typescript
// Auth errors (401, 403)
if (statusCode === 401 || statusCode === 403) {
  return {
    success: false,
    error: { type: "AUTH_ERROR", message: "..." },
  };
}

// Validation errors (400, 422)
if (statusCode === 400 || statusCode === 422) {
  return {
    success: false,
    error: { type: "VALIDATION_ERROR", message: "..." },
  };
}
```

## Logging

### Job Start

```
🤖 [AI API Job] Starting job 12345 | Conversation: abc123 |
   Attempt: 1/4 | Org: xyz789
```

### Job Success

```
✅ [AI API Job] Success | Job: 12345 | Conversation: abc123 |
   Attempt: 1 | Call: 1234ms | Response: 500 chars
```

### Job Error (Will Retry)

```
❌ [AI API Job] Failed | Job: 12345 | Conversation: abc123 |
   Attempt: 1/4 | Error Type: TIMEOUT_ERROR | Retryable: true

⏳ [AI API Job] Will retry | Job: 12345 |
   Next attempt: 2/4 | BullMQ will handle backoff automatically
```

### Job Error (Won't Retry)

```
❌ [AI API Job] Failed | Job: 12345 | Conversation: abc123 |
   Attempt: 1/4 | Error Type: AUTH_ERROR | Retryable: false

🚫 [AI API Job] Non-retryable error - job will fail | Job: 12345
```

### Job Failed Permanently

```
💥 [AI API Job] Job permanently failed | Job: 12345 |
   Conversation: abc123 | Attempts: 4 | Error: Request timeout
```

## Monitoring

### BullMQ Dashboard

```bash
# Install Bull Board (optional)
npm install @bull-board/api @bull-board/express

# Access at http://localhost:3000/admin/queues
```

### Via Logs

```bash
# Track a specific job
grep "Job: 12345" logs.txt

# Find all retry attempts
grep "AI API Job.*Attempt:" logs.txt

# Find permanently failed jobs
grep "Job permanently failed" logs.txt

# Count retries
grep "Will retry" logs.txt | wc -l
```

### Via Redis

```bash
# Connect to Redis
redis-cli

# List all jobs in queue
KEYS bull:ai-api-call:*

# Get job details
HGETALL bull:ai-api-call:12345

# Count failed jobs
ZCARD bull:ai-api-call:failed
```

## Comparison: Code Flow

### Before (Code-Based Retry)

```typescript
// ai-response.service.ts
async generateResponse() {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(...);
      return parseResponse(response);
    } catch (error) {
      if (shouldRetry(error) && attempt < maxRetries) {
        await sleep(calculateBackoff(attempt));
        continue; // Retry
      }
      throw error; // Final failure
    }
  }
}
```

### After (Queue-Based Retry)

```typescript
// ai-api-call.processor.ts
async process(job: Job) {
  try {
    const response = await axios.post(...);
    return parseResponse(response); // Success
  } catch (error) {
    const categorized = categorizeError(error);

    if (!categorized.retryable) {
      // Return error to prevent retry
      return { success: false, error: categorized };
    }

    // Throw to trigger BullMQ retry
    throw error;
  }
}
```

## Testing

### Test Retry Behavior

```typescript
// Mock network error
it("should retry on network error", async () => {
  // Add job to queue
  await queue.add("api-call", {
    conversationId: "abc123",
    organizationId: "xyz789",
    messageIds: ["msg1"],
  });

  // Wait for retries
  await job.finished();

  // Check attempts
  expect(job.attemptsMade).toBeGreaterThan(1);
});
```

### Test Non-Retryable Error

```typescript
it("should not retry on auth error", async () => {
  // Mock 401 error
  axios.post.mockRejectedValueOnce({ response: { status: 401 } });

  const job = await queue.add("api-call", { ... });
  const result = await job.finished();

  // Should complete with error, not retry
  expect(job.attemptsMade).toBe(1);
  expect(result.success).toBe(false);
  expect(result.error.type).toBe("AUTH_ERROR");
});
```

## Migration Notes

### What Changed

1. ✅ **Removed** retry loop from `ai-response.service.ts`
2. ✅ **Created** `AI_API_CALL_QUEUE` for API calls
3. ✅ **Created** `AIAPICallProcessor` with built-in retry
4. ✅ **Updated** `ai-batching.module.ts` to register new queue
5. ✅ **Simplified** `AIResponseService` - chỉ call API một lần

### What Stayed the Same

1. ✅ Error categorization (`ai-api-retry.config.ts`)
2. ✅ Structured logging with emojis
3. ✅ Actionable error advice
4. ✅ Retry configuration constants
5. ✅ AI Batch Queue workflow

### Breaking Changes

- **None** - Internal refactoring only
- API interfaces remain the same
- Batch processor still works the same way

## Best Practices

### 1. Job Idempotency

```typescript
// Use deterministic job IDs to prevent duplicates
await queue.add(
  "api-call",
  { conversationId, ... },
  { jobId: `api-call-${conversationId}-${Date.now()}` }
);
```

### 2. Timeout Configuration

```typescript
// Set appropriate timeout per attempt
defaultJobOptions: {
  timeout: 60000, // 60s per attempt
}

// Total max time = timeout * attempts
// = 60s * 4 = 240s (4 minutes)
```

### 3. Failed Job Cleanup

```typescript
// Keep failed jobs for debugging
removeOnFail: 100, // Keep last 100 failed jobs

// Or clean up after analysis
await queue.clean(24 * 3600 * 1000, "failed"); // Remove after 24h
```

### 4. Monitoring Alerts

```typescript
// Alert on high failure rate
queue.on("failed", (job, err) => {
  if (job.attemptsMade >= job.opts.attempts) {
    alerting.send({
      type: "ai_api_permanent_failure",
      jobId: job.id,
      error: err.message,
    });
  }
});
```

## Performance Considerations

### Concurrency

```typescript
@Processor(AI_API_CALL_QUEUE, {
  concurrency: 5, // Process 5 jobs concurrently
})
```

- **Too low**: Slow processing, queue buildup
- **Too high**: Rate limit issues, server overload
- **Recommended**: Start with 5, adjust based on monitoring

### Memory Usage

- ✅ `removeOnComplete: true` - Removes successful jobs
- ✅ `removeOnFail: 100` - Keeps only recent failures
- ✅ Jobs stored in Redis, not in-memory

### Redis Load

- Each job = ~1KB in Redis
- 1000 jobs = ~1MB
- Failed jobs kept for debugging = ~100KB
- Minimal impact on Redis performance

## Troubleshooting

### Jobs Stuck in Active State

```bash
# Check active jobs
redis-cli ZRANGE bull:ai-api-call:active 0 -1

# Move to failed if stalled
await queue.clean(0, "active");
```

### Jobs Not Retrying

1. Check error is thrown (not returned)
2. Check `attempts` configuration
3. Check Redis connection
4. Check worker is running

### High Failure Rate

1. Check API endpoint availability
2. Check API key validity
3. Check timeout configuration
4. Review error logs for patterns

---

## Summary

✅ **Queue-based retry** là approach tốt hơn **code-based retry** vì:

1. **Persistent** - Survive app restarts
2. **Scalable** - Multiple workers, distributed
3. **Monitorable** - BullMQ dashboard + logs
4. **Maintainable** - Separation of concerns
5. **Reliable** - Built-in, battle-tested
6. **Consistent** - Same pattern as AI batching

Retry logic giờ đây được handle bởi **BullMQ infrastructure** thay vì custom code! 🚀

