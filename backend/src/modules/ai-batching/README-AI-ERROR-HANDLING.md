# AI API Error Handling & Retry Logic

## Overview

Hệ thống xử lý lỗi và retry cho AI API calls đã được cải thiện với logging chi tiết và retry logic thông minh.

## Tính năng chính

### 1. Phân loại lỗi (Error Categorization)

Các lỗi AI API được phân loại thành các loại sau:

| Error Type         | Description            | Retryable | Examples                            |
| ------------------ | ---------------------- | --------- | ----------------------------------- |
| `NETWORK_ERROR`    | Lỗi kết nối mạng       | ✅ Yes    | ECONNREFUSED, ENOTFOUND, ECONNRESET |
| `TIMEOUT_ERROR`    | Request timeout        | ✅ Yes    | ETIMEDOUT, Request took > 60s       |
| `RATE_LIMIT_ERROR` | Vượt quá giới hạn API  | ✅ Yes    | HTTP 429                            |
| `SERVER_ERROR`     | Lỗi server AI API      | ✅ Yes    | HTTP 5xx                            |
| `AUTH_ERROR`       | Lỗi authentication     | ❌ No     | HTTP 401, 403                       |
| `VALIDATION_ERROR` | Lỗi validation dữ liệu | ❌ No     | HTTP 400, 422                       |
| `PARSE_ERROR`      | Lỗi parse response     | ❌ No     | Invalid JSON                        |
| `UNKNOWN_ERROR`    | Lỗi không xác định     | ✅ Yes    | Other errors                        |

### 2. Retry Configuration

```typescript
const DEFAULT_AI_RETRY_CONFIG = {
  maxRetries: 3, // Số lần retry tối đa
  initialDelayMs: 2000, // Delay ban đầu (2s)
  maxDelayMs: 30000, // Delay tối đa (30s)
  backoffMultiplier: 2, // Hệ số nhân cho exponential backoff
  timeoutMs: 60000, // Timeout cho mỗi request (60s)
};
```

### 3. Exponential Backoff với Jitter

Delay giữa các lần retry được tính theo công thức:

```
delay = initialDelayMs × (backoffMultiplier ^ retryCount)
delay = min(delay, maxDelayMs)
delayWithJitter = delay ± 20% random
```

**Ví dụ:**

- Attempt 1 → fails → wait ~2s (1.6-2.4s with jitter)
- Attempt 2 → fails → wait ~4s (3.2-4.8s with jitter)
- Attempt 3 → fails → wait ~8s (6.4-9.6s with jitter)
- Attempt 4 → final attempt

Jitter (±20%) giúp tránh thundering herd problem khi nhiều requests retry cùng lúc.

### 4. Structured Logging

#### Request Logging

```
🤖 [AI API Request] Conversation: abc123 | Org: xyz789 |
   Endpoint: https://api.miagent.io/v1/chat-messages |
   Query length: 150 chars | Files: 2 | Has conversation_id: true
```

#### Success Logging

```
✅ [AI API Success] Conversation: abc123 | Attempt: 1 |
   Duration: 1234ms (total: 1234ms) | Response length: 500 chars |
   Chunks: 10 | AI Conversation ID: ai_conv_123
```

#### Error Logging

```
❌ [AI API Error] Conversation: abc123 | Org: xyz789 |
   Attempt: 1/4 | Duration: 5000ms | Error Type: TIMEOUT_ERROR |
   Status: 408 | Retryable: true | Message: Request timeout after 60000ms
```

#### Retry Logging

```
⏳ [AI API Retry] Conversation: abc123 |
   Will retry in 2150ms (attempt 2/4)
```

#### Final Failure Logging

```
🚫 [AI API Final Failure] Conversation: abc123 |
   Error Type: AUTH_ERROR | Status: 401 | Total Duration: 1500ms |
   Attempts: 1 | Reason: Non-retryable error

💡 [AI API Advice] AUTH_ERROR - Please check API key for organization xyz789.
   The API key may be invalid, expired, or lack necessary permissions.
```

### 5. Actionable Error Advice

Mỗi loại lỗi đi kèm với lời khuyên cụ thể:

#### AUTH_ERROR

```
💡 Please check API key for organization {orgId}.
   The API key may be invalid, expired, or lack necessary permissions.
```

#### RATE_LIMIT_ERROR

```
💡 Organization {orgId} has exceeded rate limits.
   Consider increasing batch delay or upgrading API plan.
```

#### VALIDATION_ERROR

```
💡 Request payload is invalid. Check conversation {conversationId}
   for unusual message content or formatting issues.
```

#### TIMEOUT_ERROR

```
💡 AI API took too long to respond. This may indicate heavy load
   or complex query. Consider increasing timeout or simplifying requests.
```

#### NETWORK_ERROR

```
💡 Unable to reach AI API endpoint. Check network connectivity
   and verify the endpoint URL is correct.
```

#### SERVER_ERROR

```
💡 AI API server is experiencing issues. This is usually temporary.
   The system will retry automatically.
```

## Batch Processor Improvements

### Job Lifecycle Logging

```
🔄 [AI Batch] Starting job 12345 | Conversation: abc123 |
   Org: xyz789 | Messages: 3 | Job attempts: 1

📝 [AI Batch] Found 3 pending messages for conversation abc123

🤖 [AI Batch] Calling AI service for conversation abc123

✅ [AI Batch] AI response generated in 2500ms |
   Conversation: abc123 | Length: 500 chars

💾 [AI Batch] AI response saved | Conversation: abc123 |
   Message: msg_123 | Platform: WEB

📤 [AI Batch] Emitted AI message to web visitor |
   Session: session_123 | Message: msg_123

✅ [AI Batch] Job 12345 completed successfully |
   Conversation: abc123 | Total duration: 3200ms
```

### Error Recovery

```
❌ [AI Batch] Job 12345 failed | Conversation: abc123 |
   Org: xyz789 | Duration: 5000ms | Error: Request timeout

💡 [AI Batch] Recovery: Conversation abc123 state reset to AI_ACTIVE.
   Next visitor message will trigger a new batch.
```

## Usage Examples

### Monitoring Logs

#### Tìm tất cả AI API errors

```bash
grep "AI API Error" logs.txt
```

#### Tìm retry attempts

```bash
grep "AI API Retry" logs.txt
```

#### Tìm final failures

```bash
grep "AI API Final Failure" logs.txt
```

#### Theo dõi một conversation cụ thể

```bash
grep "Conversation: abc123" logs.txt | grep "AI"
```

#### Tìm lỗi theo loại

```bash
grep "Error Type: AUTH_ERROR" logs.txt
grep "Error Type: RATE_LIMIT_ERROR" logs.txt
grep "Error Type: TIMEOUT_ERROR" logs.txt
```

### Performance Analysis

#### Tính trung bình response time

```bash
grep "AI API Success" logs.txt | grep -oP 'Duration: \K\d+' | awk '{sum+=$1; count++} END {print sum/count}'
```

#### Đếm số lần retry

```bash
grep "AI API Retry" logs.txt | wc -l
```

#### Phân tích tỷ lệ thành công

```bash
success=$(grep "AI API Success" logs.txt | wc -l)
failure=$(grep "AI API Final Failure" logs.txt | wc -l)
echo "Success rate: $(echo "scale=2; $success/($success+$failure)*100" | bc)%"
```

## Best Practices

### 1. Monitoring

- Set up alerts cho `AI API Final Failure` với `AUTH_ERROR` → API key có vấn đề
- Monitor số lượng `RATE_LIMIT_ERROR` → cần tăng batch delay hoặc upgrade plan
- Track average response time để phát hiện performance issues

### 2. Configuration

- Điều chỉnh `batchDelayMs` trong organization settings để tránh rate limits
- Tăng `timeoutMs` nếu queries phức tạp thường bị timeout
- Giảm `maxRetries` nếu muốn fail fast hơn

### 3. Debugging

- Sử dụng `conversationId` để theo dõi toàn bộ flow của một conversation
- Check `AI API Request Details` để xem payload được gửi đi
- Review `AI API Error Response` để hiểu root cause

### 4. Error Handling

- `AUTH_ERROR` và `VALIDATION_ERROR` → không retry, cần fix ngay
- `RATE_LIMIT_ERROR` → retry với delay lớn hơn
- `TIMEOUT_ERROR` và `SERVER_ERROR` → retry tự động
- `NETWORK_ERROR` → kiểm tra connectivity

## File Structure

```
backend/src/modules/ai-batching/
├── ai-api-retry.config.ts       # Retry configuration & error categorization
├── ai-response.service.ts       # AI API caller with retry logic
├── ai-batching.processor.ts     # Batch job processor with enhanced logging
└── README-AI-ERROR-HANDLING.md  # This file
```

## Testing

### Test retry logic

1. Simulate network error:

   - Đổi endpoint thành invalid URL
   - Expect: 3 retries với exponential backoff
   - Log: NETWORK_ERROR với retry messages

2. Simulate auth error:

   - Đổi API key thành invalid key
   - Expect: Fail ngay không retry
   - Log: AUTH_ERROR với advice

3. Simulate timeout:

   - Set timeout rất thấp (100ms)
   - Expect: 3 retries
   - Log: TIMEOUT_ERROR với retry messages

4. Simulate rate limit:
   - Gửi nhiều requests liên tiếp
   - Expect: Retry với backoff
   - Log: RATE_LIMIT_ERROR với retry-after

## Changelog

### v1.0.0 (2025-01-07)

- ✨ Added structured error categorization (7 error types)
- ✨ Implemented exponential backoff with jitter
- ✨ Added comprehensive request/response logging
- ✨ Added actionable error advice
- ✨ Enhanced batch processor logging
- 🐛 Fixed: API errors không được categorize đúng
- 🐛 Fixed: Không có thông tin để debug timeout issues
- 🐛 Fixed: Retry logic không có exponential backoff
- 📝 Added complete documentation

## Future Improvements

- [ ] Add metrics export (Prometheus)
- [ ] Add circuit breaker pattern
- [ ] Add request/response caching
- [ ] Add A/B testing for different retry strategies
- [ ] Add distributed tracing (OpenTelemetry)
