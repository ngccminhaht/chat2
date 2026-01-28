# Telegram Bot Integration Research

**Date:** 2026-01-28
**Purpose:** Research Telegram Bot API for integration into MiAgent omnichannel platform

---

## 1. Authentication & Bot Setup

### Bot Token Format
- Pattern: `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`
- Obtained from **BotFather** when creating a bot
- User provides this token during platform connection setup
- Token used in all API calls: `https://api.telegram.org/bot<token>/METHOD_NAME`

### Key Differences from Other Platforms
- **No OAuth flow** - users simply create bot via BotFather and copy token
- **No app secret** - token itself is the only credential
- Simpler connection flow compared to Facebook/Zalo OAuth

---

## 2. Webhook Architecture

### Webhook Setup Requirements

#### 2.1 SSL/TLS (MANDATORY)
- **Required:** TLS 1.2 or higher
- **Rejected:** SSLv2/3, TLS 1.0/1.1
- Plain HTTP webhooks NOT supported
- Both self-signed and CA-verified certificates supported
- Certificate CN/SAN must match webhook domain exactly

#### 2.2 Supported Ports
- 443 (HTTPS standard)
- 80 (HTTP but still requires TLS)
- 88
- 8443

#### 2.3 IP Whitelisting (Optional but Recommended)
Telegram sends webhook requests from these subnets:
- `149.154.160.0/20`
- `91.108.4.0/22`

**Implementation note:** Add IP validation in webhook controller for additional security.

### Webhook Registration

Use `setWebhook` method with these key parameters:

```bash
curl -X POST "https://api.telegram.org/bot<token>/setWebhook" \
  -d url="https://your-domain.com/api/webhooks/telegram/<connectionId>" \
  -d secret_token="<random-secret-256-chars>" \
  -d max_connections=100 \
  -d drop_pending_updates=true \
  -d allowed_updates='["message","edited_message","channel_post","callback_query"]'
```

#### Key Parameters:
- **url** (required): HTTPS webhook endpoint
- **secret_token** (1-256 chars): Sent in `X-Telegram-Bot-Api-Secret-Token` header for verification
- **max_connections**: 1-100 (default: 40)
- **allowed_updates**: Array of update types to receive (reduces noise)
- **drop_pending_updates**: Clear queued updates on webhook change

---

## 3. Security Implementation

### 3.1 Secret Token Validation (RECOMMENDED)

Unlike Facebook's HMAC signature, Telegram uses a simpler secret token approach:

**Setup:**
1. Generate random secret (1-256 chars) when user connects bot
2. Store secret in `PlatformConnection.credentials.webhookSecret`
3. Pass secret to `setWebhook`

**Verification:**
```typescript
verifySignature(rawBody: string, signature: string, secret: string): boolean {
  // For Telegram, signature param is actually the header value
  // Header: X-Telegram-Bot-Api-Secret-Token
  return signature === secret;
}
```

**Implementation note:**
- `signature` parameter in adapter receives the header value
- Simple string comparison (no HMAC needed)
- Store secret in DB alongside bot token

### 3.2 Additional Security Layers
1. **IP Whitelisting:** Validate request IP against Telegram subnets
2. **HTTPS:** Enforced by Telegram
3. **Token Privacy:** Never expose bot token in logs/responses

---

## 4. Chat Types & Message Patterns

### 4.1 Chat Types
Telegram supports 4 chat types (different from Facebook's page-only model):

| Chat Type | Description | Conversation Pattern |
|-----------|-------------|---------------------|
| `private` | 1:1 direct message with bot | `user:{userId}` |
| `group` | Group chat (up to 200k members) | `group:{chatId}` |
| `supergroup` | Large group with advanced features | `supergroup:{chatId}` |
| `channel` | Broadcast channel (bot as admin) | `channel:{chatId}` |

**Key differences from Facebook:**
- Facebook: Only Page conversations (1:1 inbox or comments)
- Telegram: Bots can work in groups/channels, not just 1:1
- Telegram groups have bot visibility settings (privacy mode)

### 4.2 Bot Privacy Mode
- **Privacy mode ON** (default): Bot only sees messages that mention it or are commands
- **Privacy mode OFF**: Bot sees ALL messages in group
- **Admin bots:** Always see all messages

**Implementation note:** Document this limitation for users - group conversations may have incomplete message history.

### 4.3 Message Thread Support (NEW in 2026)
- Forums/topics in private chats now supported
- Field: `message_thread_id` identifies topic
- Field: `is_topic_message` boolean flag

---

## 5. Update Object Structure

### 5.1 Update Types
Every webhook POST contains an `Update` object with:
- **update_id** (required): Unique sequential ID
- **One of these fields:**
  - `message`: New incoming message
  - `edited_message`: Message was edited
  - `channel_post`: New post in channel
  - `edited_channel_post`: Channel post edited
  - `callback_query`: Inline button pressed
  - `inline_query`: User typing inline query
  - `chosen_inline_result`: User selected inline result
  - `poll`: Poll state updated
  - `poll_answer`: User voted in poll
  - `my_chat_member`: Bot's status in chat changed
  - `chat_member`: Other member status changed

**Key insight:** Unlike Facebook's `entry[].messaging[]` array pattern, Telegram sends one update per webhook POST.

### 5.2 Message Object Structure
```typescript
{
  message_id: number,          // Unique message identifier
  from: User,                  // Sender
  chat: Chat,                  // Chat where message was sent
  date: number,                // Unix timestamp
  text?: string,               // Text content
  entities?: MessageEntity[],  // Formatting (bold, links, mentions)
  photo?: PhotoSize[],         // Photo attachments
  video?: Video,               // Video attachment
  document?: Document,         // File attachment
  audio?: Audio,               // Audio attachment
  voice?: Voice,               // Voice message
  sticker?: Sticker,           // Sticker
  location?: Location,         // Geo location
  reply_to_message?: Message,  // Replied message
  // ... 50+ other optional fields
}
```

---

## 6. Message Type Mapping

### 6.1 Content Type Detection
Unlike Facebook's `attachments[]` array, Telegram uses direct fields:

| Telegram Field | Our MessageType | Notes |
|----------------|-----------------|-------|
| `text` | TEXT | Plain text or caption |
| `photo[]` | IMAGE | Array of sizes (use largest) |
| `video` | VIDEO | Video file |
| `audio` | AUDIO | Audio file (music) |
| `voice` | AUDIO | Voice message (different from audio) |
| `document` | FILE | Generic file |
| `sticker` | STICKER | Sticker |
| `location` | LOCATION | Geo coordinates |
| `animation` | VIDEO | GIF/animation (treat as video) |
| `video_note` | VIDEO | Circular video message |

**Implementation note:** Check fields in order of priority (photo > video > audio > document > text).

### 6.2 Text Formatting (Entities)
Telegram supports rich text via `entities[]` array:
- `bold`, `italic`, `underline`, `strikethrough`
- `code`, `pre` (code blocks)
- `text_link` (hyperlinks)
- `text_mention` (mention user without @username)
- `url`, `email`, `phone_number` (auto-detected)
- `hashtag`, `cashtag`, `bot_command`

**Storage strategy:** Store raw text in `content.text` and entities array in `metadata.entities` for future formatting support.

---

## 7. Sending Messages (Outbound)

### 7.1 API Methods

| Method | Purpose | Key Parameters |
|--------|---------|----------------|
| `sendMessage` | Send text | `chat_id`, `text`, `parse_mode` |
| `sendPhoto` | Send image | `chat_id`, `photo` (URL or file_id) |
| `sendVideo` | Send video | `chat_id`, `video` |
| `sendDocument` | Send file | `chat_id`, `document` |
| `sendAudio` | Send audio | `chat_id`, `audio` |
| `sendVoice` | Send voice | `chat_id`, `voice` |
| `sendLocation` | Send location | `chat_id`, `latitude`, `longitude` |
| `sendSticker` | Send sticker | `chat_id`, `sticker` |

### 7.2 Common Parameters
- **chat_id**: Target chat (user ID or chat ID)
- **message_thread_id**: Optional, for forum topics
- **reply_parameters**: For threading (reply to message)
- **parse_mode**: "Markdown", "HTML", or omit for plain text
- **disable_notification**: Silent message

### 7.3 Send Response
```typescript
{
  ok: boolean,
  result: Message,  // Sent message object with message_id
  error_code?: number,
  description?: string
}
```

**Success:** Extract `result.message_id` for `platformMessageId`
**Error:** Return `{ success: false, error: description }`

---

## 8. User Profile Retrieval

### 8.1 No Direct Profile API
**Critical difference from Facebook/Zalo:**
- Telegram has **NO** dedicated `getUser()` API
- Can only get profile from messages or `getChatMember()`

### 8.2 Options for Profile Data

#### Option A: Extract from Message Object
Every message includes `from: User` with:
```typescript
{
  id: number,              // User ID
  is_bot: boolean,         // Bot flag
  first_name: string,      // First name (required)
  last_name?: string,      // Last name (optional)
  username?: string,       // @username (optional)
  language_code?: string,  // "en", "vi", etc.
  is_premium?: boolean     // Premium user flag
}
```

**Implementation:** Extract profile from first message in conversation and update on subsequent messages if changed.

#### Option B: Use getChatMember (for group context only)
```typescript
getChatMember(chat_id: string, user_id: number)
```
Returns `ChatMember` object with User + status (creator/admin/member/restricted/left/kicked).

**Limitation:** Only works in groups, not for private chats.

### 8.3 Profile Photo
**No direct photo URL in User object.**

To get profile photo:
1. Call `getUserProfilePhotos(user_id)`
2. Get `file_id` from result
3. Call `getFile(file_id)` to get file path
4. Construct URL: `https://api.telegram.org/file/bot<token>/<file_path>`

**Implementation note:** Make profile photo fetching async/lazy (don't block message processing).

---

## 9. Adapter Pattern Integration

### 9.1 Platform Constants
```typescript
// backend/src/common/constants/platforms.constant.ts
export enum Platform {
  FACEBOOK = 'facebook',
  ZALO = 'zalo',
  TIKTOK = 'tiktok',
  SHOPEE = 'shopee',
  TELEGRAM = 'telegram', // ADD
}
```

### 9.2 Adapter Structure
```typescript
@Injectable()
export class TelegramAdapter extends BasePlatformAdapter {
  readonly platform = Platform.TELEGRAM;

  // Verify secret token (not HMAC)
  verifySignature(rawBody: string, signature: string, secret: string): boolean {
    return signature === secret;
  }

  // Extract bot ID from update (or from connection)
  extractAccountId(payload: unknown): string {
    const update = payload as TelegramUpdate;
    // Bot ID is embedded in token, or extract from update.message.chat.id
    return String(update.message?.chat?.id || 'unknown');
  }

  // Parse Update object to PlatformEvent[]
  extractEvents(payload: unknown): PlatformEvent[] {
    const update = payload as TelegramUpdate;
    const events: PlatformEvent[] = [];

    if (update.message) {
      events.push(this.parseMessage(update.message));
    }
    if (update.edited_message) {
      // Handle edits (optional)
    }
    if (update.callback_query) {
      // Handle button clicks (optional)
    }

    return events;
  }

  // Convert Telegram message to NormalizedMessage
  normalizeMessage(event: MessageEvent): NormalizedMessage {
    const conversationKey = this.getConversationKey(
      String(event.senderId),
      String(event.recipientId)
    );

    return {
      platform: Platform.TELEGRAM,
      platformMessageId: String(event.messageId),
      conversationKey,
      direction: MessageDirection.INBOUND,
      type: event.messageType,
      senderId: String(event.senderId),
      recipientId: String(event.recipientId),
      content: event.content,
      timestamp: event.timestamp,
      metadata: {
        rawPayload: event.rawPayload,
        chatType: (event.rawPayload as any).chat?.type,
        messageThreadId: (event.rawPayload as any).message_thread_id,
        entities: (event.rawPayload as any).entities,
      },
    };
  }

  // Conversation key: chat_id (since bot can be in multiple chats)
  getConversationKey(senderId: string, recipientId: string): string {
    // For Telegram, conversationKey is the chat_id
    // In private chats: chat_id = user_id
    // In groups: chat_id = group_id (negative number)
    return senderId; // senderId is actually chat_id
  }

  // Format outbound message for Telegram API
  formatOutbound(message: OutboundMessage): PlatformPayload {
    const payload: any = {
      chat_id: message.recipientId,
    };

    if (message.type === MessageType.TEXT) {
      return {
        method: 'sendMessage',
        ...payload,
        text: message.content.text,
      };
    } else if (message.type === MessageType.IMAGE) {
      return {
        method: 'sendPhoto',
        ...payload,
        photo: message.content.mediaUrl,
        caption: message.content.text,
      };
    }
    // ... other types

    return payload;
  }

  // Send message via Telegram API
  async send(
    connection: PlatformConnectionDocument,
    recipientId: string,
    payload: PlatformPayload
  ): Promise<SendResult> {
    try {
      const botToken = connection.credentials.botToken;
      const method = payload.method || 'sendMessage';

      const response = await axios.post(
        `https://api.telegram.org/bot${botToken}/${method}`,
        payload
      );

      if (!response.data.ok) {
        return {
          success: false,
          error: response.data.description,
        };
      }

      return {
        success: true,
        platformMessageId: String(response.data.result.message_id),
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.description || error.message,
      };
    }
  }

  // Fetch user profile (limited in Telegram)
  async fetchUserProfile(
    connection: PlatformConnectionDocument,
    userId: string
  ): Promise<UserProfile> {
    // Option 1: Return cached profile from last message
    // Option 2: Try getChatMember if chat_id available
    // For now, return basic profile from cached message data
    return this.createDefaultProfile(userId, 'Telegram User');
  }
}
```

### 9.3 Key Implementation Differences

| Aspect | Facebook | Telegram |
|--------|----------|----------|
| Auth | OAuth 2.0 | Bot token from BotFather |
| Signature | HMAC SHA256 | Secret token (plain string) |
| Webhook format | `entry[].messaging[]` array | Single `Update` object |
| Chat types | Page only | Private/Group/Supergroup/Channel |
| Conversation key | `senderId_pageId` | `chat_id` |
| Profile API | Graph API `/userId` | Extract from messages |
| Send method | Single `POST /me/messages` | Multiple methods (`sendMessage`, `sendPhoto`, etc.) |

---

## 10. Database Schema Considerations

### 10.1 PlatformConnection Credentials
```typescript
{
  platform: 'telegram',
  credentials: {
    botToken: string,      // From BotFather
    webhookSecret: string, // Generated secret for webhook validation
    botUsername?: string,  // Optional, bot's @username for display
    botName?: string,      // Optional, bot display name
  },
  status: 'active' | 'error',
  platformAccountId: string, // Bot user ID (extract from getMe API)
}
```

### 10.2 Conversation Metadata
```typescript
{
  platform: 'telegram',
  platformConversationId: string, // chat_id
  metadata: {
    chatType: 'private' | 'group' | 'supergroup' | 'channel',
    chatTitle?: string,            // Group/channel name
    chatUsername?: string,         // Public @username if available
    messageThreadId?: number,      // For forum topics
  }
}
```

### 10.3 Message Metadata
```typescript
{
  platform: 'telegram',
  metadata: {
    rawPayload: TelegramMessage,
    chatType: string,
    entities?: MessageEntity[],   // Text formatting
    replyToMessageId?: number,    // If replying
    forwardFrom?: any,            // If forwarded
    messageThreadId?: number,     // Forum topic
  }
}
```

---

## 11. Environment Variables

```bash
# backend/.env
TELEGRAM_ENABLED=true  # Feature flag (optional)
```

**Note:** Unlike Facebook/Zalo, Telegram doesn't need app-level credentials. Each bot connection has its own token.

---

## 12. Implementation Checklist

### Phase 1: Core Integration
- [ ] Add `Platform.TELEGRAM` to constants
- [ ] Create `TelegramAdapter` implementing `IPlatformAdapter`
- [ ] Create Telegram module (`telegram.controller.ts`, `telegram.service.ts`)
- [ ] Implement webhook endpoint: `POST /api/webhooks/telegram/:connectionId`
- [ ] Implement webhook verification (secret token)
- [ ] Add IP whitelisting middleware (optional but recommended)
- [ ] Parse Update objects to PlatformEvent
- [ ] Normalize Telegram messages to database format
- [ ] Implement send methods (text, image, video, file)

### Phase 2: Connection Management
- [ ] Frontend: Add Telegram to platform connection UI
- [ ] Form: Bot token input with validation
- [ ] Backend: Store bot token in PlatformConnection
- [ ] Call `getMe` API to validate token and get bot info
- [ ] Generate webhook secret (crypto.randomBytes)
- [ ] Call `setWebhook` API with URL + secret
- [ ] Store webhook secret in credentials
- [ ] Test webhook with Telegram's test tool

### Phase 3: Advanced Features
- [ ] Support edited messages (`edited_message`)
- [ ] Support callback queries (inline buttons)
- [ ] Support inline queries (optional)
- [ ] Lazy-load user profile photos
- [ ] Handle group chat context (optional)
- [ ] Support forum topics/threads (optional)
- [ ] Handle bot commands (optional)

### Phase 4: Testing
- [ ] Test private chat messaging (1:1)
- [ ] Test media uploads (image, video, file)
- [ ] Test webhook signature validation
- [ ] Test error handling (invalid token, network errors)
- [ ] Test concurrent connections (multiple bots)

---

## 13. Open Questions

1. **Group chat support:** Do we want to support group chats in Phase 1, or only private chats?
   - **Recommendation:** Start with private chats only. Add group support in Phase 2 if needed.

2. **Profile photos:** Async/lazy loading or block message processing?
   - **Recommendation:** Lazy load. Store placeholder initially, fetch photo in background.

3. **Message edits:** Store as new message or update existing?
   - **Recommendation:** Store as new message with `editedMessageId` reference (audit trail).

4. **Webhook URL pattern:**
   - Option A: `/webhooks/telegram/:connectionId` (connection-specific)
   - Option B: `/webhooks/telegram` (bot token in URL path like Facebook)
   - **Recommendation:** Option A (cleaner, consistent with other platforms).

5. **Rate limits:** Telegram has rate limits (30 msg/sec to same chat).
   - **Implementation:** Add queue system in Phase 2 if needed.

---

## 14. Sources

Research based on official documentation and best practices:

- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Telegram Webhooks Guide](https://core.telegram.org/bots/webhooks)
- [How to Set Up Telegram Bot Webhook - Pinggy](https://pinggy.io/blog/how_to_set_up_and_test_telegram_bot_webhook/)
- [Telegram Webhook Integration - Airbyte](https://airbyte.com/data-engineering-resources/telegram-webhooks)
- [Secret Token Validation - GitGuardian](https://docs.gitguardian.com/secrets-detection/secrets-detection-engine/detectors/specifics/telegrambot_bot_token)
- [Telegram Bot API - GitHub Examples](https://github.com/thevickypedia/telegram-webhook)

---

## 15. Next Steps

1. **Review this document** with team for architecture approval
2. **Update CLAUDE.md** with Telegram integration guidelines
3. **Create implementation plan** (detailed task breakdown)
4. **Implement Phase 1** (core integration with private chat support)
5. **Test with real bot** and iterate
