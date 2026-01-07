# Cải thiện Logging & Retry cho AI API Calls

**Date:** 2025-01-07  
**Status:** ✅ Completed  
**Type:** Enhancement

## 📋 Tổng quan

Cải thiện hệ thống logging và retry logic cho AI API calls để dễ dàng debug, monitor và xử lý lỗi tốt hơn.

## 🎯 Mục tiêu

### Vấn đề hiện tại

1. ❌ Logging không đủ chi tiết để debug khi AI API fail
2. ❌ Không có retry logic, fail ngay lập tức
3. ❌ Không phân biệt các loại lỗi (retryable vs non-retryable)
4. ❌ Không có thông tin về timing, attempts, error context
5. ❌ Khó theo dõi flow của một conversation qua logs

### Mục tiêu mới

1. ✅ Logging có cấu trúc, dễ search và filter
2. ✅ Retry logic với exponential backoff
3. ✅ Phân loại lỗi rõ ràng với actionable advice
4. ✅ Track timing cho mỗi request/retry
5. ✅ Dễ dàng theo dõi conversation flow

## 🔧 Thay đổi kỹ thuật

### 1. File mới: `ai-api-retry.config.ts`

Tạo file cấu hình retry và error handling:

**Tính năng:**

- ✅ Định nghĩa 7 loại lỗi (NETWORK, TIMEOUT, RATE_LIMIT, SERVER, AUTH, VALIDATION, UNKNOWN)
- ✅ Retry configuration với exponential backoff
- ✅ Error categorization functions
- ✅ `AIAPIError` class với detailed context

**Retry Config:**

```typescript
{
  maxRetries: 3,           // Retry tối đa 3 lần
  initialDelayMs: 2000,    // Delay ban đầu 2s
  maxDelayMs: 30000,       // Delay tối đa 30s
  backoffMultiplier: 2,    // x2 mỗi lần
  timeoutMs: 60000,        // Timeout 60s
}
```

**Error Types:**

- `NETWORK_ERROR` → Retryable (lỗi kết nối)
- `TIMEOUT_ERROR` → Retryable (timeout)
- `RATE_LIMIT_ERROR` → Retryable (vượt quota)
- `SERVER_ERROR` → Retryable (5xx errors)
- `AUTH_ERROR` → Not retryable (401/403)
- `VALIDATION_ERROR` → Not retryable (400/422)
- `PARSE_ERROR` → Not retryable
- `UNKNOWN_ERROR` → Retryable (để an toàn)

### 2. Cập nhật: `ai-response.service.ts`

**Thêm import:**

```typescript
import { AxiosError } from "axios";
import {
  DEFAULT_AI_RETRY_CONFIG,
  categorizeAIError,
  calculateAIBackoff,
  sleep,
  AIErrorType,
  AIAPIError,
} from "./ai-api-retry.config";
```

**Method mới: `callAIAPIWithRetry()`**

Thay thế logic cũ bằng method mới với:

- ✅ Retry loop với max attempts
- ✅ Detailed logging cho mỗi attempt
- ✅ Error categorization
- ✅ Exponential backoff với jitter (±20%)
- ✅ Response validation
- ✅ Timing tracking
- ✅ Actionable advice cho errors

**Method mới: `logErrorAdvice()`**

Cung cấp lời khuyên cụ thể cho từng loại lỗi:

- AUTH_ERROR → Check API key
- RATE_LIMIT_ERROR → Tăng batch delay hoặc upgrade plan
- VALIDATION_ERROR → Check message content
- TIMEOUT_ERROR → Tăng timeout hoặc simplify request
- NETWORK_ERROR → Check connectivity
- SERVER_ERROR → Temporary issue, retry tự động

### 3. Cập nhật: `ai-batching.processor.ts`

**Enhanced logging cho batch processor:**

**Job start:**

```
🔄 [AI Batch] Starting job 12345 | Conversation: abc123 |
   Org: xyz789 | Messages: 3 | Job attempts: 1
```

**Processing steps:**

```
📝 [AI Batch] Found 3 pending messages for conversation abc123
🤖 [AI Batch] Calling AI service for conversation abc123
✅ [AI Batch] AI response generated in 2500ms | Length: 500 chars
💾 [AI Batch] AI response saved | Message: msg_123 | Platform: WEB
📤 [AI Batch] Emitted AI message to web visitor | Session: session_123
```

**Job complete:**

```
✅ [AI Batch] Job 12345 completed successfully | Total duration: 3200ms
```

**Error handling:**

```
❌ [AI Batch] Job 12345 failed | Duration: 5000ms | Error: Request timeout
💡 [AI Batch] Recovery: State reset to AI_ACTIVE. Next message will trigger new batch.
```

## 📊 Log Format

### Request Log

```
🤖 [AI API Request] Conversation: abc123 | Org: xyz789 |
   Endpoint: https://api.miagent.io/v1/chat-messages |
   Query length: 150 chars | Files: 2 | Has conversation_id: true
```

### Success Log

```
✅ [AI API Success] Conversation: abc123 | Attempt: 1 |
   Duration: 1234ms (total: 1234ms) | Response length: 500 chars |
   Chunks: 10 | AI Conversation ID: ai_conv_123
```

### Error Log

```
❌ [AI API Error] Conversation: abc123 | Org: xyz789 |
   Attempt: 1/4 | Duration: 5000ms | Error Type: TIMEOUT_ERROR |
   Status: 408 | Retryable: true | Message: Request timeout
```

### Retry Log

```
⏳ [AI API Retry] Conversation: abc123 |
   Will retry in 2150ms (attempt 2/4)
```

### Final Failure Log

```
🚫 [AI API Final Failure] Conversation: abc123 |
   Error Type: AUTH_ERROR | Status: 401 | Total Duration: 1500ms |
   Attempts: 1 | Reason: Non-retryable error

💡 [AI API Advice] AUTH_ERROR - Please check API key for organization xyz789.
```

## 🎨 Log Format Design

### Emojis cho quick scanning

- 🤖 AI API Request
- ✅ Success
- ❌ Error
- ⏳ Retry
- 🚫 Final Failure
- 💡 Advice
- 🔄 Batch Start
- 📝 Messages Found
- 💾 Saved
- 📤 Sent

### Prefix pattern

`[Component] Action | Key: Value | Key: Value`

### Consistent key names

- `Conversation:`
- `Org:`
- `Attempt:`
- `Duration:`
- `Error Type:`
- `Status:`
- `Message:`

## 🧪 Testing Scenarios

### 1. Normal Success

```
Request → Success (1st attempt)
Logs:
  🤖 Request
  ✅ Success
  🔄 Batch start
  ✅ Batch complete
```

### 2. Retry then Success

```
Request → Timeout → Retry → Success
Logs:
  🤖 Request (attempt 1)
  ❌ Error (TIMEOUT_ERROR)
  ⏳ Retry in 2000ms
  🤖 Request (attempt 2)
  ✅ Success
```

### 3. Auth Error (No Retry)

```
Request → 401 Unauthorized
Logs:
  🤖 Request (attempt 1)
  ❌ Error (AUTH_ERROR, status 401)
  🚫 Final Failure (Non-retryable)
  💡 Advice (Check API key)
```

### 4. Max Retries Exceeded

```
Request → 503 → Retry → 503 → Retry → 503 → Retry → 503
Logs:
  🤖 Request (attempt 1)
  ❌ Error (SERVER_ERROR, 503)
  ⏳ Retry in ~2s
  🤖 Request (attempt 2)
  ❌ Error (SERVER_ERROR, 503)
  ⏳ Retry in ~4s
  🤖 Request (attempt 3)
  ❌ Error (SERVER_ERROR, 503)
  ⏳ Retry in ~8s
  🤖 Request (attempt 4)
  ❌ Error (SERVER_ERROR, 503)
  🚫 Final Failure (Max retries exceeded)
  💡 Advice (Temporary server issue)
```

## 📈 Monitoring & Debugging

### Tìm tất cả errors của một org

```bash
grep "Org: xyz789" logs.txt | grep "AI API Error"
```

### Tìm rate limit errors

```bash
grep "RATE_LIMIT_ERROR" logs.txt
```

### Tìm auth errors (cần fix API key)

```bash
grep "AUTH_ERROR" logs.txt
```

### Theo dõi một conversation

```bash
grep "Conversation: abc123" logs.txt
```

### Tính success rate

```bash
success=$(grep "AI API Success" logs.txt | wc -l)
failure=$(grep "AI API Final Failure" logs.txt | wc -l)
echo "Success: $success, Failure: $failure"
```

### Tính average response time

```bash
grep "AI API Success" logs.txt | grep -oP 'Duration: \K\d+' | awk '{sum+=$1; n++} END {print sum/n "ms"}'
```

## 🚀 Lợi ích

### 1. Debugging dễ hơn

- **Trước:** "AI API failed" → không biết tại sao
- **Sau:** Có error type, status code, response data, timing, attempts

### 2. Monitoring tốt hơn

- Track success rate theo org
- Identify rate limit issues
- Monitor response times
- Alert on auth errors

### 3. Reliability cao hơn

- Auto retry cho transient errors
- Exponential backoff tránh overwhelm server
- Jitter tránh thundering herd

### 4. Troubleshooting nhanh hơn

- Actionable advice cho mỗi error type
- Easy to search logs by conversation/org
- Clear indication of retryable vs non-retryable

### 5. Performance insights

- Track timing cho mỗi stage
- Identify slow conversations
- Optimize batch delays

## 📝 Files Changed

1. **New:** `backend/src/modules/ai-batching/ai-api-retry.config.ts`

   - Retry configuration
   - Error categorization
   - Helper functions

2. **Modified:** `backend/src/modules/ai-batching/ai-response.service.ts`

   - Added `callAIAPIWithRetry()` method
   - Added `logErrorAdvice()` method
   - Enhanced all log messages
   - Replaced simple try-catch với retry loop

3. **Modified:** `backend/src/modules/ai-batching/ai-batching.processor.ts`

   - Enhanced all log messages
   - Added timing tracking
   - Added detailed error logging
   - Improved recovery messages

4. **New:** `backend/src/modules/ai-batching/README-AI-ERROR-HANDLING.md`
   - Complete documentation
   - Usage examples
   - Best practices

## ✅ Checklist

- [x] Tạo retry configuration file
- [x] Implement error categorization
- [x] Add retry logic với exponential backoff
- [x] Add jitter để tránh thundering herd
- [x] Enhance request logging
- [x] Enhance success logging
- [x] Enhance error logging
- [x] Add actionable advice
- [x] Update batch processor logging
- [x] Add timing tracking
- [x] Write documentation
- [x] Test linter (no errors)

## 🎓 Lessons Learned

1. **Structured logging** giúp debugging và monitoring dễ dàng hơn rất nhiều
2. **Exponential backoff with jitter** là best practice cho retry logic
3. **Error categorization** giúp system biết nên retry hay không
4. **Actionable advice** giúp developers fix issues nhanh hơn
5. **Consistent log format** giúp parsing và searching dễ dàng

## 🔮 Future Improvements

1. Add metrics export (Prometheus)
2. Add circuit breaker pattern
3. Add request/response caching
4. Add distributed tracing (OpenTelemetry)
5. Add alerting rules cho critical errors

## 📚 References

- [Exponential Backoff Best Practices](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
- [HTTP Status Codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)
- [Structured Logging](https://www.google.com/sre/workbook/chapters/structured-logging/)
