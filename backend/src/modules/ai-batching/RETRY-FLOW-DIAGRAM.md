# AI API Retry Flow Diagram

## Flow Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI Batch Job Triggered                        │
│                  (Visitor message debounced)                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │ Get Messages   │
                    │ Get Customer   │
                    │ Get Org Config │
                    └────────┬───────┘
                             │
                             ▼
        ╔════════════════════════════════════════════════╗
        ║         callAIAPIWithRetry()                   ║
        ║  maxRetries: 3, timeout: 60s, backoff: 2x     ║
        ╚════════════════════════════════════════════════╝
                             │
                             ▼
                    ┌────────────────┐
                    │   Attempt 1    │
                    │  Send Request  │
                    └────────┬───────┘
                             │
                ┌────────────┴────────────┐
                │                         │
                ▼                         ▼
        ┌──────────────┐         ┌──────────────┐
        │   SUCCESS    │         │    ERROR     │
        │  (HTTP 200)  │         │ (Exception)  │
        └──────┬───────┘         └──────┬───────┘
               │                        │
               │                        ▼
               │               ┌─────────────────┐
               │               │ Categorize Error│
               │               │ (7 error types) │
               │               └────────┬────────┘
               │                        │
               │         ┌──────────────┴──────────────┐
               │         │                             │
               │         ▼                             ▼
               │  ┌─────────────┐            ┌──────────────┐
               │  │ Non-Retry   │            │  Retryable   │
               │  │ (AUTH, 4xx) │            │ (5xx, timeout)│
               │  └──────┬──────┘            └──────┬───────┘
               │         │                          │
               │         ▼                          ▼
               │  ┌─────────────┐     ┌────────────────────┐
               │  │FINAL FAILURE│     │ Attempt < Max?     │
               │  │   + ADVICE  │     └─────┬──────────┬───┘
               │  └─────────────┘           │          │
               │                            │ Yes      │ No
               │                            ▼          ▼
               │                    ┌──────────┐  ┌────────┐
               │                    │Backoff + │  │ FINAL  │
               │                    │  Jitter  │  │FAILURE │
               │                    └────┬─────┘  └────────┘
               │                         │
               │                         ▼
               │                  ┌─────────────┐
               │                  │   Sleep     │
               │                  │ (2s, 4s, 8s)│
               │                  └──────┬──────┘
               │                         │
               │                         ▼
               │                  ┌─────────────┐
               │                  │  Attempt 2  │
               │                  │(or 3, or 4) │
               │                  └──────┬──────┘
               │                         │
               │                         │ (Loop back)
               │                         │
               ▼                         ▼
        ┌──────────────────────────────────────┐
        │    Parse Streaming Response          │
        │  (Extract chunks, conversation_id)   │
        └────────────────┬─────────────────────┘
                         │
                         ▼
                ┌────────────────┐
                │ Save AI Message│
                └────────┬───────┘
                         │
            ┌────────────┴────────────┐
            │                         │
            ▼                         ▼
    ┌──────────────┐          ┌──────────────┐
    │  WEB Platform│          │Other Platforms│
    │ (WebSocket)  │          │    (Kafka)    │
    └──────┬───────┘          └──────┬────────┘
           │                         │
           ▼                         ▼
    Emit to Visitor           Publish to Queue
```

## Retry Timing

```
Attempt 1: ───────────────X (fails at t=0)
                          │
                          ▼ wait ~2s (1.6-2.4s with jitter)

Attempt 2: ─────────────────────X (fails at t=2s)
                                │
                                ▼ wait ~4s (3.2-4.8s with jitter)

Attempt 3: ─────────────────────────────X (fails at t=6s)
                                        │
                                        ▼ wait ~8s (6.4-9.6s with jitter)

Attempt 4: ─────────────────────────────────────X (final failure at t=14s)
           (Final attempt)                      │
                                                ▼
                                          FINAL FAILURE
```

## Error Decision Tree

```
                    API Call Failed
                          │
                          ▼
              ┌───────────────────────┐
              │  Extract Status Code  │
              │    & Error Message    │
              └───────────┬───────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│Network/Timeout│  │ HTTP Response│  │Unknown Error │
│ ECONNREFUSED │  │  (Status Code)│  │ (Unexpected) │
│  ETIMEDOUT   │  └──────┬───────┘  └──────┬───────┘
└──────┬───────┘         │                 │
       │                 │                 │
       │     ┌───────────┴───────────┐     │
       │     │                       │     │
       │     ▼                       ▼     │
       │ ┌────────┐            ┌────────┐ │
       │ │ 401/403│            │ 429/5xx│ │
       │ │ 400/422│            │ 408/503│ │
       │ └───┬────┘            └────┬───┘ │
       │     │                      │     │
       ▼     ▼                      ▼     ▼
   ┌──────────────┐           ┌──────────────┐
   │  RETRYABLE   │           │ NON-RETRYABLE│
   │              │           │              │
   │ • Network    │           │ • Auth       │
   │ • Timeout    │           │ • Validation │
   │ • 429        │           │ • 400/422    │
   │ • 5xx        │           │ • 404        │
   │ • Unknown    │           │              │
   └──────┬───────┘           └──────┬───────┘
          │                          │
          ▼                          ▼
   Check attempts < max?        FAIL IMMEDIATELY
          │                     + Log Advice
          ├─ Yes → Retry
          └─ No  → Final Failure
```

## Log Flow for Success Case

```
Time    Event                           Log
─────────────────────────────────────────────────────────────────
t=0ms   Batch job starts               🔄 [AI Batch] Starting job...

t=10ms  Messages found                 📝 [AI Batch] Found 3 pending messages

t=15ms  AI service called              🤖 [AI Batch] Calling AI service

t=20ms  API request sent               🤖 [AI API Request] Conversation: abc123
                                          Query length: 150 chars...

t=25ms  Request details                🤖 [AI API Request Details]
                                          Query preview: "Hello..."

t=30ms  Attempt 1 started              🔄 [AI API] Attempt 1/4...

t=2500ms Response received            ✅ [AI API Success] Attempt: 1
                                          Duration: 2470ms
                                          Response length: 500 chars

t=2520ms Response saved                💾 [AI Batch] AI response saved
                                          Message: msg_123

t=2540ms WebSocket emit                📤 [AI Batch] Emitted to visitor
                                          Session: session_123

t=2550ms Job complete                  ✅ [AI Batch] Job completed
                                          Total duration: 2550ms
```

## Log Flow for Retry Case

```
Time    Event                           Log
─────────────────────────────────────────────────────────────────
t=0ms   Request sent                   🤖 [AI API Request] Conversation: abc123

t=30ms  Attempt 1                      🔄 [AI API] Attempt 1/4...

t=60000ms Timeout!                     ❌ [AI API Error] Attempt: 1/4
                                          Duration: 60000ms
                                          Error Type: TIMEOUT_ERROR
                                          Status: 408 | Retryable: true

t=60001ms Calculate backoff            ⏳ [AI API Retry]
                                          Will retry in 2150ms (attempt 2/4)

t=62151ms Attempt 2                    🔄 [AI API] Attempt 2/4...

t=64151ms Success!                     ✅ [AI API Success] Attempt: 2
                                          Duration: 2000ms (total: 64151ms)
                                          Response length: 500 chars
```

## Log Flow for Final Failure

```
Time    Event                           Log
─────────────────────────────────────────────────────────────────
t=0ms   Request sent                   🤖 [AI API Request] Conversation: abc123

t=100ms Attempt 1 - Auth Error         ❌ [AI API Error] Attempt: 1/4
                                          Error Type: AUTH_ERROR
                                          Status: 401 | Retryable: false

t=101ms Response data logged           ❌ [AI API Error Response]
                                          {"error": "Invalid API key"}

t=102ms Final failure                  🚫 [AI API Final Failure]
                                          Error Type: AUTH_ERROR | Status: 401
                                          Attempts: 1
                                          Reason: Non-retryable error

t=103ms Advice logged                  💡 [AI API Advice] AUTH_ERROR
                                          Please check API key for org xyz789

t=200ms Job fails                      ❌ [AI Batch] Job 12345 failed
                                          Duration: 200ms
                                          Error: Request failed with 401

t=201ms Recovery message               💡 [AI Batch] Recovery:
                                          State reset to AI_ACTIVE
                                          Next message will trigger new batch
```

## Exponential Backoff Visualization

```
Delay (seconds)
    │
 30 │                                        ────────── (max: 30s)
    │
 24 │
    │
 16 │                        ┌────┐
    │                        │    │
  8 │            ┌────┐      │    │
    │            │    │      │    │
  4 │      ┌────┐│    │      │    │
    │      │    ││    │      │    │
  2 │ ┌────┐    ││    │      │    │
    │ │    │    ││    │      │    │
  0 └─┴────┴────┴┴────┴──────┴────┴────────────────── Attempt
    0  1    2    3    4      5    6

Without Jitter:  2s → 4s → 8s → 16s → 30s → 30s
With Jitter ±20%: [1.6-2.4] → [3.2-4.8] → [6.4-9.6] → [12.8-19.2]
```

## Error Type Distribution (Example)

```
Error Type               Count    Percentage   Retried   Success After Retry
─────────────────────────────────────────────────────────────────────────────
TIMEOUT_ERROR            45       30%          45        38 (84%)
SERVER_ERROR (5xx)       32       21%          32        28 (87%)
RATE_LIMIT_ERROR         18       12%          18        18 (100%)
NETWORK_ERROR            15       10%          15        12 (80%)
AUTH_ERROR               25       17%          0         0 (N/A)
VALIDATION_ERROR         12        8%          0         0 (N/A)
UNKNOWN_ERROR            3         2%          3         2 (67%)
─────────────────────────────────────────────────────────────────────────────
TOTAL                    150      100%         113       98 (87%)

Overall Success Rate: 75% (113 successful / 150 total)
Retry Success Rate: 87% (98 successful after retry / 113 retried)
```

## State Machine

```
                    ┌──────────────┐
                    │  AI_ACTIVE   │
                    │ (Ready for   │
                    │  new batch)  │
                    └──────┬───────┘
                           │
                           │ Visitor message
                           │ + batch delay expires
                           │
                           ▼
                  ┌─────────────────┐
                  │ AI_RESPONDING   │◄────┐
                  │ (Processing)    │     │
                  └────┬──────┬─────┘     │
                       │      │           │
         Success       │      │ Error     │ Retry
                       │      │           │
                       ▼      ▼           │
              ┌────────┐  ┌────────┐     │
              │ DONE   │  │ANALYZE │─────┘
              └───┬────┘  │ ERROR  │
                  │       └────┬───┘
                  │            │
                  │            │ Non-retryable
                  │            │ or max retries
                  │            │
                  ▼            ▼
           ┌──────────────────────┐
           │    AI_ACTIVE         │
           │ (Reset for next msg) │
           └──────────────────────┘
```

---

## Key Takeaways

1. **Intelligent Retry**: Only retry errors that make sense (network, timeout, 5xx, rate limit)
2. **Exponential Backoff**: Don't overwhelm the server (2s → 4s → 8s)
3. **Jitter**: Prevent thundering herd (±20% randomness)
4. **Structured Logs**: Easy to search, parse, and monitor
5. **Actionable Advice**: Help developers fix issues quickly
6. **Timing Tracking**: Understand performance bottlenecks
7. **Context Preservation**: Full debugging information in logs
