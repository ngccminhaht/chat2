# Fix: Facebook Inbox vs Comment Detection in AI Messages

## 🐛 Problem Description

When sending messages to AI, the system could not distinguish between **inbox messages** and **comment messages** from Facebook, even though both types can exist in the same conversation.

### Root Cause

1. The `MessageCombiner.getPlatformLabel()` function required a `message` parameter to check the `isComment` flag
2. However, when called in `createAIRequest()` (line 342), **the message parameter was not passed**
3. This resulted in all Facebook messages being labeled as "FACEBOOK:INBOX" regardless of their actual type
4. Only **one platform label was used for the entire batch**, instead of individual labels per message

## ✅ Solution Implemented

### 1. Refactored `getPlatformLabel()` Signature

**File:** `src/modules/ai-batching/utils/message-combiner.ts:38-40`

```typescript
// Before: getPlatformLabel(platform, conversation?, message?)
// After:  getPlatformLabel(platform, message?)
```

Removed the unused `conversation` parameter to simplify the function signature.

### 2. Added Platform Label Per Message

**File:** `src/modules/ai-batching/utils/message-combiner.ts:133-157`

Each message in the batch now gets its own platform label based on its metadata:

```typescript
// Get platform label for THIS specific message
const messagePlatformLabel = this.getPlatformLabel(platform, message);

// Format examples:
// [FACEBOOK:INBOX] Customer: message text
// [FACEBOOK:COMMENT] Customer: message text
const prefix = `[${messagePlatformLabel}] ${customerName}:`;
text = `${prefix} ${text}`;
```

### 3. Updated Interface to Include Message

**File:** `src/modules/ai-batching/utils/message-combiner.ts:10-22`

```typescript
export interface CombinedMessageData {
  // ...
  latestMessage: {
    conversation: ConversationDocument;
    message: MessageDocument;  // ✅ Added to pass message metadata
    conversationData?: any;
  };
}
```

### 4. Pass Message in Return Statement

**File:** `src/modules/ai-batching/utils/message-combiner.ts:276-283`

```typescript
latestMessage: {
  conversation: sortedMessages[last]?.conversation || messages[0]?.conversation,
  message: sortedMessages[last]?.message || messages[0]?.message,  // ✅ Pass message
}
```

### 5. Fixed Function Call in createAIRequest()

**File:** `src/modules/ai-batching/utils/message-combiner.ts:333-337`

```typescript
const latestMessage = combinedData.latestMessage?.message;
const platformLabel = this.getPlatformLabel(platform, latestMessage);
```

## 🎯 Detection Logic

The system checks the `isComment` flag in message metadata:

```typescript
// Priority order:
1. message.metadata.isComment === true
2. message.metadata.rawPayload.isComment === true
3. Default to false (INBOX) if not found
```

**Result:**
- `isComment === true` → `"FACEBOOK:COMMENT"`
- `isComment === false` or undefined → `"FACEBOOK:INBOX"`

## 📊 Test Results

All test cases passed:

✅ Inbox message (metadata.isComment = false) → `FACEBOOK:INBOX`
✅ Comment message (metadata.isComment = true) → `FACEBOOK:COMMENT`
✅ RawPayload only (rawPayload.isComment = true) → `FACEBOOK:COMMENT`
✅ No metadata → `FACEBOOK:INBOX` (default)
✅ Undefined message → `FACEBOOK:INBOX` (default)
✅ Non-Facebook platform → Platform-specific label (e.g., `Zalo`)

## 🚀 Impact

### Before Fix
```
AI receives:
[Thông tin khách hàng: ... | from: FACEBOOK:INBOX]

Customer: Hello from inbox
Customer: Hello from comment  ❌ Wrong - should be COMMENT
```

### After Fix
```
AI receives:
[Thông tin khách hàng: ... | from: FACEBOOK:COMMENT]  ✅ Correct

[FACEBOOK:INBOX] Customer: Hello from inbox
[FACEBOOK:COMMENT] Customer: Hello from comment  ✅ Correct
```

## 🔍 Key Points

1. **Per-Message Labels:** Each message now has its own platform label
2. **Conversation Support:** One conversation can contain both inbox and comment messages
3. **Backward Compatible:** Default to INBOX if metadata is missing
4. **Type Safety:** No TypeScript errors
5. **Accurate Context:** AI now receives correct source information for each message

## 📝 Files Modified

- `src/modules/ai-batching/utils/message-combiner.ts` - Core fix
- `src/modules/ai-batching/utils/message-combiner.spec.ts` - Unit tests (created)
- `test-message-combiner-manual.js` - Manual test script (created)

## ✅ Verification

Run manual test:
```bash
node backend/test-message-combiner-manual.js
```

Expected output:
```
✅ All tests PASSED!
```
