# AI Message Parsing - Multi-Message Support

## Overview

AI responses can contain images or videos embedded in markdown format. This feature automatically parses these responses and sends them as separate messages to provide a better user experience.

## Implementation

### 1. Message Parser Utility

**Location:** `backend/src/modules/ai-batching/utils/ai-message-parser.ts`

The `AIMessageParser` class provides:

- **`parseTextAndMedia(text: string)`**: Extracts text, images, and videos from AI response
- **`isValidMediaUrl(url: string, type: 'image' | 'video')`**: Validates media URLs

### 2. Supported Markdown Formats

**Images:**
```markdown
![Alt text](https://example.com/image.jpg)
```

**Videos:**
```markdown
[Video description](https://example.com/video.mp4)
```

**Supported formats:**
- Images: jpg, jpeg, png, gif, webp, avif, bmp, svg, tiff, tif, ico, heic, heif
- Videos: mp4, mov, avi, mkv, webm, 3gp, flv, wmv

### 3. Message Flow

When AI returns a response containing media:

1. **Parse**: `AIMessageParser.parseTextAndMedia()` splits response into parts
2. **Validate**: Each media URL is validated before sending
3. **Send**: Each part is sent as a separate message sequentially
4. **Retry**: Media messages have 3 retry attempts, text has 1
5. **Fallback**: If media sending fails, sends as text fallback
6. **Delay**: 1 second delay between messages to prevent rate limiting

### 4. Example AI Response

**Input (AI response):**
```
Great question! Here's what I found:

First, check out this product image:
![Red Shoes](https://cdn.example.com/products/shoes-red-123.jpg)

The product features include:
- Premium leather
- Available sizes: 7-12

Watch this demo video to see them in action:
[Product Demo](https://cdn.example.com/videos/shoes-demo.mp4)

Let me know if you need anything else!
```

**Output (sent as 5 separate messages):**
1. Text: "Great question! Here's what I found:\n\nFirst, check out this product image:"
2. Image: `https://cdn.example.com/products/shoes-red-123.jpg`
3. Text: "The product features include:\n- Premium leather\n- Available sizes: 7-12\n\nWatch this demo video to see them in action:"
4. Video: `https://cdn.example.com/videos/shoes-demo.mp4`
5. Text: "Let me know if you need anything else!"

## Architecture

### Message Part Structure

```typescript
interface MessagePart {
  type: 'text' | 'image' | 'video';
  content: string;  // Text content or media URL
  alt?: string;     // Alt text for images/videos
}
```

### Processing Flow

```
AI Response
    ↓
AIMessageParser.parseTextAndMedia()
    ↓
MessagePart[] (text, image, video, text, image, ...)
    ↓
For each part:
    ↓
Validate media URL (if applicable)
    ↓
Save to database
    ↓
Send via Kafka (platforms) or WebSocket (web)
    ↓
Retry on failure (with exponential backoff)
    ↓
Fallback to text if all retries fail
    ↓
1 second delay before next message
```

## Error Handling

### Invalid Media URLs

If a media URL is invalid:
1. Log warning
2. Send as text fallback: `[ALT_TEXT]\n[URL]`

### Send Failures

If sending a media message fails after 3 retries:
1. Log error
2. Send as text fallback: `[ALT_TEXT]\n[URL]`

### Text Message Failures

Text messages only retry once - if failed, the error is thrown to halt processing.

## Platform Support

Works with all platforms:
- **Web chat**: Sends via WebSocket to widget
- **Facebook Messenger**: Sends via Kafka → Facebook adapter
- **Zalo OA**: Sends via Kafka → Zalo adapter
- **TikTok Shop**: Sends via Kafka → TikTok adapter
- **Shopee**: Sends via Kafka → Shopee adapter

## Testing

**Test file:** `backend/src/modules/ai-batching/utils/ai-message-parser.spec.ts`

Run tests:
```bash
npm test -- ai-message-parser.spec.ts
```

**Test coverage:**
- Plain text parsing
- Single image/video parsing
- Multiple media parsing
- Media at beginning/end of text
- Empty/whitespace handling
- Various image/video formats
- Realistic AI responses
- URL validation

## Logging

All operations are logged with detailed context:

```
📋 [AI Batch] Parsed AI response into 5 part(s) | Types: text, image, text, video, text
📨 [AI Batch] Processing part 1/5 | Type: text | IsLast: false
💾 [AI Batch] Message part saved | Type: text | Message: 507f1f77bcf86cd799439011
📤 [AI Batch] Publishing text message to Kafka...
✅ [AI Batch] Successfully published text message to Kafka
```

## Configuration

No configuration needed - feature works automatically when AI responses contain markdown media.

## Performance

- **Parse time**: ~1-2ms for typical responses
- **Delay between messages**: 1000ms (1 second)
- **Retry delay**: Exponential backoff (1s, 2s, 3s)
- **Max retries**: 3 for media, 1 for text

## Migration Notes

This is a **non-breaking change**:
- Existing text-only AI responses work exactly as before
- Only responses with markdown media are split into multiple messages
- No database schema changes required
- No API changes required

## Future Improvements

Potential enhancements:
- Support for audio files
- Support for file attachments (PDF, DOC, etc.)
- Configurable delay between messages
- Configurable retry attempts
- Support for markdown links (non-media)
- Support for markdown formatting (bold, italic, etc.)
