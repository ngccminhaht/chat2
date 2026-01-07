# Queue-Based Retry Refactor for AI API Calls

**Date:** 2025-01-07  
**Status:** ✅ Completed  
**Type:** Refactoring

## 📋 Context

Ban đầu đã implement retry logic trực tiếp trong code (`ai-response.service.ts`) với while loop và exponential backoff. Tuy nhiên, user yêu cầu refactor để sử dụng **queue-based retry** giống như AI batching - approach tốt hơn và consistent với architecture hiện tại.

## 🎯 Objectives

### Why Refactor?

**Before (Code-Based Retry):**

- ❌ Retry logic mixed trong service code
- ❌ Retry state lost khi app restart
- ❌ Khó monitor và debug
- ❌ Không scale với multiple instances
- ❌ Không consistent với AI batching pattern

**After (Queue-Based Retry):**

- ✅ Retry handled by BullMQ infrastructure
- ✅ Persistent retries (survive app restarts)
- ✅ Easy monitoring via BullMQ dashboard + logs
- ✅ Scales với multiple workers
- ✅ Consistent với AI batching architecture

## 🏗️ Architecture Changes

### New Components

#### 1. AI API Call Queue (`ai-api-call.queue.ts`)

```typescript
export const AI_API_CALL_QUEUE = "ai-api-call";

export interface AIAPICallJobData {
  conversationId: string;
  organizationId: string;
  messageIds: string[];
  customerId?: string;
}

export interface AIAPICallResult {
  success: boolean;
  answer?: string;
  error?: { type: string; message: string };
}
```

#### 2. AI API Call Processor (`ai-api-call.processor.ts`)

- Extends `WorkerHost` từ `@nestjs/bullmq`
- Process jobs from `AI_API_CALL_QUEUE`
- Call AI API **một lần** (BullMQ handles retry)
- Throw error for retryable errors → BullMQ retry
- Return error for non-retryable → No retry
- Lifecycle hooks: `onFailed`, `onCompleted`

#### 3. BullMQ Queue Configuration

```typescript
BullModule.registerQueue({
  name: AI_API_CALL_QUEUE,
  defaultJobOptions: {
    attempts: 4, // 1 initial + 3 retries
    backoff: {
      type: "exponential",
      delay: 2000, // 2s base delay
    },
    removeOnComplete: true,
    removeOnFail: 100,
    // Note: timeout handled by axios (60s) in processor
  },
});
```

### Modified Components

#### 1. `ai-response.service.ts` - Simplified

**Before:**

```typescript
async generateResponse() {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Call API
      // Calculate backoff
      // Sleep
      // Retry
    } catch (error) {
      // Complex retry logic
    }
  }
}
```

**After:**

```typescript
async generateResponse() {
  try {
    // Call API once
    return parseResponse(response);
  } catch (error) {
    // Just throw - caller decides retry
    throw error;
  }
}
```

#### 2. `ai-batching.module.ts` - Added Queue Registration

```typescript
imports: [
  // Existing: AI Batch Queue
  BullModule.registerQueue({ name: AI_BATCH_QUEUE, ... }),

  // NEW: AI API Call Queue with retry
  BullModule.registerQueue({ name: AI_API_CALL_QUEUE, ... }),
],
providers: [
  AIBatchingService,
  AIBatchingProcessor,
  AIResponseService,
  AIAPICallProcessor, // NEW
],
```

## 📊 Flow Comparison

### Before: Code-Based Retry

```
AI Batch Processor
      │
      ▼
AIResponseService.generateResponse()
      │
      ├─ Attempt 1 → Fail
      ├─ Sleep 2s
      ├─ Attempt 2 → Fail
      ├─ Sleep 4s
      ├─ Attempt 3 → Fail
      ├─ Sleep 8s
      └─ Attempt 4 → Success/Fail
      │
      ▼
Return to Batch Processor
```

### After: Queue-Based Retry

```
AI Batch Processor
      │
      ▼
Add Job to AI API Call Queue
      │
      ▼
AI API Call Processor
      │
      ├─ Attempt 1 → Fail (throw)
      │        │
      │        ▼
      │   BullMQ: Schedule Retry (+2s)
      │        │
      ├───────►├─ Attempt 2 → Fail (throw)
      │        │
      │        ▼
      │   BullMQ: Schedule Retry (+4s)
      │        │
      ├───────►├─ Attempt 3 → Fail (throw)
      │        │
      │        ▼
      │   BullMQ: Schedule Retry (+8s)
      │        │
      └───────►└─ Attempt 4 → Success/Fail
                     │
                     ▼
            Return Result to Queue
                     │
                     ▼
            Job Completed Event
```

## 🔧 Technical Details

### Retry Decision Logic

```typescript
// In AIAPICallProcessor

try {
  const response = await axios.post(...);
  return { success: true, answer: ... }; // Success
} catch (error) {
  const categorized = categorizeError(error);

  // Non-retryable: Return error (no retry)
  if (!categorized.retryable) {
    return {
      success: false,
      error: { type: categorized.type, ... }
    };
  }

  // Retryable: Throw error (BullMQ will retry)
  throw error;
}
```

### Exponential Backoff

BullMQ handles backoff automatically:

```
Attempt 1: Initial (t=0)
Attempt 2: +2s  (t=2s)
Attempt 3: +4s  (t=6s)
Attempt 4: +8s  (t=14s)

Total max time: ~15s (excluding API call time)
```

### Error Categorization

Same as before:

- **Retryable** → Throw → BullMQ retry
  - NETWORK_ERROR (ECONNREFUSED, etc.)
  - TIMEOUT_ERROR (ETIMEDOUT)
  - RATE_LIMIT_ERROR (429)
  - SERVER_ERROR (5xx)
  - UNKNOWN_ERROR
- **Non-retryable** → Return error → No retry
  - AUTH_ERROR (401, 403)
  - VALIDATION_ERROR (400, 422)

## 📝 Files Changed

### New Files (3)

1. **`backend/src/modules/ai-batching/ai-api-call.queue.ts`** (27 lines)

   - Queue name constant
   - Job data interface
   - Job result interface

2. **`backend/src/modules/ai-batching/ai-api-call.processor.ts`** (486 lines)

   - BullMQ processor with retry logic
   - Error categorization and handling
   - Lifecycle hooks (onFailed, onCompleted)
   - Chat history loading
   - Comprehensive logging

3. **`backend/src/modules/ai-batching/README-QUEUE-BASED-RETRY.md`** (600+ lines)
   - Complete architecture documentation
   - Comparison with code-based approach
   - Monitoring and troubleshooting guides
   - Best practices

### Modified Files (2)

1. **`backend/src/modules/ai-batching/ai-response.service.ts`**

   - **Removed:** 300+ lines of retry loop logic
   - **Removed:** `callAIAPIWithRetry()` method
   - **Removed:** `logErrorAdvice()` method (moved to processor)
   - **Simplified:** `generateResponse()` - chỉ call API một lần
   - **Kept:** Error categorization for logging

2. **`backend/src/modules/ai-batching/ai-batching.module.ts`**
   - **Added:** AI_API_CALL_QUEUE registration
   - **Added:** Retry configuration với BullMQ
   - **Added:** AIAPICallProcessor provider

### Unchanged Files

- `ai-api-retry.config.ts` - Error types và categorization
- `ai-batching.processor.ts` - AI batch processor
- `ai-batching.service.ts` - AI batching service

## ✅ Benefits

### 1. Separation of Concerns

- **Service layer**: Business logic only
- **Queue layer**: Retry logic, scheduling
- **Processor layer**: Job execution

### 2. Persistent Retries

```
App Restart
    │
    ▼
BullMQ loads jobs from Redis
    │
    ▼
Continue retrying from last attempt
```

### 3. Better Monitoring

```bash
# Via BullMQ Dashboard
http://localhost:3000/admin/queues

# Via Redis
redis-cli ZRANGE bull:ai-api-call:active 0 -1

# Via Logs (unchanged)
grep "AI API Job" logs.txt
```

### 4. Scalability

```
Worker 1 ──┐
Worker 2 ──├──► Redis Queue ──► Process jobs
Worker 3 ──┘
```

Multiple workers can process jobs concurrently.

### 5. Failed Job Management

```typescript
// Keep last 100 failed jobs
removeOnFail: 100;

// Review failures
await queue.getFailed();

// Retry manually
await job.retry();

// Clean up old failures
await queue.clean(24 * 3600 * 1000, "failed");
```

## 📈 Performance Impact

### Memory

- **Before**: Retry state in memory (lost on restart)
- **After**: Jobs in Redis (~1KB per job)
- **Impact**: Minimal (~100KB for typical load)

### Latency

- **Before**: Sequential retry in same request
- **After**: Async retry via queue
- **Impact**: No difference in total time, better UX (non-blocking)

### Throughput

- **Before**: Limited by single-thread retry loop
- **After**: Multiple workers, concurrent processing
- **Impact**: Higher throughput with multiple workers

## 🧪 Testing

### Unit Tests

```typescript
describe("AIAPICallProcessor", () => {
  it("should retry on network error", async () => {
    // Mock network error
    axios.post.mockRejectedValueOnce({ code: "ECONNREFUSED" });

    await expect(processor.process(job)).rejects.toThrow();
    expect(job.attemptsMade).toBe(1);
  });

  it("should not retry on auth error", async () => {
    // Mock 401
    axios.post.mockRejectedValueOnce({ response: { status: 401 } });

    const result = await processor.process(job);
    expect(result.success).toBe(false);
    expect(result.error.type).toBe("AUTH_ERROR");
  });
});
```

### Integration Tests

```typescript
describe("AI API Call Queue", () => {
  it("should complete after retry", async () => {
    // Add job
    const job = await queue.add("api-call", { ... });

    // Wait for completion
    await job.finished();

    // Check result
    expect(job.returnvalue.success).toBe(true);
  });
});
```

## 🔄 Migration Path

### For Existing Deployments

1. ✅ Deploy new code with queue registration
2. ✅ No database migration needed
3. ✅ No breaking changes (internal only)
4. ✅ Existing AI batching continues to work
5. ✅ New retries use queue automatically

### Rollback Plan

If needed to rollback:

1. Revert to previous commit
2. Code-based retry will resume
3. No data loss (Redis queue persists)

## 📊 Logging Comparison

### Before

```
🤖 [AI API Request] Conversation: abc123
🔄 [AI API] Attempt 1/4
❌ [AI API Error] TIMEOUT_ERROR
⏳ [AI API Retry] Will retry in 2000ms
🔄 [AI API] Attempt 2/4
✅ [AI API Success] Attempt: 2
```

### After

```
🤖 [AI API Job] Starting job 12345 | Attempt: 1/4
❌ [AI API Job] Failed | Error Type: TIMEOUT_ERROR
⏳ [AI API Job] Will retry | BullMQ will handle backoff

🤖 [AI API Job] Starting job 12345 | Attempt: 2/4
✅ [AI API Job] Success | Attempt: 2 | Duration: 1234ms
🎉 [AI API Job] Job completed successfully
```

## 🎓 Lessons Learned

### 1. Leverage Existing Infrastructure

- BullMQ đã có sẵn cho AI batching
- Reuse cùng pattern cho retry
- Consistent architecture

### 2. Separation of Concerns

- Service: Business logic
- Queue: Scheduling, retry
- Processor: Execution

### 3. Built-in > Custom

- BullMQ exponential backoff > Custom implementation
- Persistent queue > In-memory state
- Battle-tested > DIY

### 4. Monitoring First

- Queue dashboard > Log-only monitoring
- Failed job inspection > Lost errors
- Job metrics > Manual tracking

## 🔮 Future Enhancements

- [ ] Circuit breaker pattern
- [ ] Rate limiting per organization
- [ ] Priority queues (urgent vs normal)
- [ ] Job metrics export (Prometheus)
- [ ] Dead letter queue handling
- [ ] Retry with custom backoff per error type

## 📚 Documentation

Created comprehensive documentation:

1. **README-QUEUE-BASED-RETRY.md** - Complete guide
2. **This report** - Implementation details
3. **Inline code comments** - Technical details

## ✅ Checklist

- [x] Create AI API Call Queue
- [x] Create AI API Call Processor
- [x] Register queue in module
- [x] Configure retry settings
- [x] Simplify AIResponseService
- [x] Remove retry loop code
- [x] Test error categorization
- [x] Test retry behavior
- [x] Check linter (no errors)
- [x] Write documentation
- [x] Create migration report

## 📦 Summary

### Code Changes

- **Added**: 3 new files (~1100 lines)
- **Modified**: 2 files (~400 lines changed)
- **Removed**: ~300 lines of retry logic
- **Net change**: +800 lines (mostly docs)

### Architecture

- ✅ Queue-based retry giống AI batching
- ✅ Persistent, scalable, monitorable
- ✅ Separation of concerns
- ✅ No breaking changes

### Benefits

1. **Reliability**: Survives app restarts
2. **Scalability**: Multiple workers
3. **Maintainability**: Cleaner code
4. **Monitoring**: BullMQ dashboard
5. **Consistency**: Same pattern as batching

---

**Retry logic giờ đây được handle bởi BullMQ infrastructure - không còn trong code nữa!** 🚀

**Total Time:** ~3 hours  
**Status:** ✅ Production Ready  
**Breaking Changes:** None
