# AI Agents Module

AI agent utilities and services for message processing.

## Features

- **MessageCombiner**: Combines batched messages into AI request format
- **FacebookFormatter**: Converts markdown to Facebook-compatible format (*bold*, _italic_, etc.)

## Usage

### MessageCombiner

Utility to combine messages for AI API requests:

```typescript
import { MessageCombiner } from '@/modules/ai-agents/utils/message-combiner';

const combinedData = MessageCombiner.combineMessages(messages);
const requestData = MessageCombiner.createAIRequest(combinedData, user, customer);
```

### FacebookFormatter

Format markdown text for Facebook:

```typescript
import { FacebookFormatter } from '@/modules/ai-agents/utils/facebook-formatter';

const formatted = FacebookFormatter.markdownToFBFormat(markdownText);
```

## Architecture

### Components

1. **MessageCombiner**: Combines batched messages into AI request format
2. **FacebookFormatter**: Converts markdown to Facebook-compatible format

## Notes

- AI logic is handled by `AIResponseService` in `ai-batching` module
- Works with existing BullMQ batching system
- Supports all platforms (Web, Facebook, Zalo, etc.)
