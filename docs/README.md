# MiAgent Documentation

Comprehensive documentation for the Omnichannel Chat Platform.

## Getting Started

Start with these documents in order:

1. **[system-architecture.md](./system-architecture.md)** - Understand the platform architecture, module organization, and message flows
2. **[api-docs.md](./api-docs.md)** - Reference for all API endpoints and WebSocket events

## Documentation by Topic

### Architecture & Design
- [System Architecture](./system-architecture.md)
  - Platform adapter pattern
  - Message flow diagrams
  - Module organization
  - Database schemas
  - Deployment strategy

### API Reference
- [API Documentation](./api-docs.md)
  - Public endpoints (widget configuration)
  - Authentication endpoints
  - Conversation & message APIs
  - WebSocket events
  - Error handling

### Development Guides (Coming Soon)
- Code Standards
- Development Setup Guide
- Deployment Guide
- Troubleshooting Guide
- Testing Strategy

---

## Quick References

### Core Concepts

**Platforms Supported:**
- Facebook Messenger
- Zalo OA
- TikTok Shop
- Shopee
- **Web Chat Widget** (★ New in Phase 1)

**Key Endpoints:**
- `GET /api/widget/:orgSlug/config` - Widget configuration (public)
- `GET /api/conversations` - List conversations
- `POST /api/messages/send` - Send message
- `GET /api/connections/:platform/auth-url` - OAuth flow

**Message Types:**
- Text, Image, Video, File, Sticker, Audio, Location

**Statuses:**
- Connections: active, inactive, pending, expired, error
- Conversations: open, pending, resolved, closed
- Messages: pending, sent, delivered, read, failed

---

## Web Chat Widget (Phase 1 New Feature)

The new **Web Chat Widget** platform enables embedding a chat widget on external websites.

### Key Features
- Public, unauthenticated widget configuration endpoint
- WebSocket-based real-time messaging
- No OAuth required (visitor-based conversations)
- Customizable appearance and greeting messages
- Pre-chat form support

### Implementation Details
- **Platform Code:** `Platform.WEB`
- **Adapter:** `WebPlatformAdapter` (backend/src/modules/platforms/adapters/web.adapter.ts)
- **Configuration Endpoint:** `GET /api/widget/:orgSlug/config`
- **Message Flow:** Direct WebSocket → Webhook Processor → Normalized Format → Kafka Bridge
- **Conversation Key Format:** `web_{organizationId}_{visitorId}`

### Widget Configuration Response
```json
{
  "organizationId": "507f1f77bcf86cd799439011",
  "organizationName": "Acme Corporation",
  "primaryColor": "#0066FF",
  "position": "right",
  "greeting": "Hi! How can we help you today?",
  "logo": "https://example.com/logo.png",
  "offlineMessage": "We are currently offline. Leave a message and we will get back to you.",
  "preChatForm": false,
  "preChatFields": ["name", "email"]
}
```

---

## Architecture Overview

### Message Flow
```
Webhook/WebSocket Input
  ↓
Platform Adapter (normalize)
  ↓
Conversation Manager (find or create)
  ↓
Message Storage (MongoDB)
  ↓
Kafka Broker (async distribution)
  ↓
WebSocket Bridge (real-time sync)
  ↓
Frontend Client (Zustand state update)
```

### Module Structure

**Backend:** `backend/src/modules/`
- `auth/` - Authentication & JWT
- `organizations/` - Organization management
- `conversations/` - Conversation CRUD
- `messages/` - Message handling
- `widget/` ★ NEW - Widget configuration API
- `platforms/` - Platform adapters & registry
- `connections/` - OAuth & credential management
- `websocket/` - Real-time Socket.IO gateway

**Frontend:** `frontend/`
- `features/` - Business logic by domain
- `components/` - Reusable UI components
- `lib/` - Shared utilities and APIs
- `hooks/` - Custom React hooks
- `stores/` - Zustand state management

---

## Environment Setup

### Backend (.env)
```bash
MONGODB_URI=mongodb://localhost:27017/omnichat
JWT_SECRET=<generate with openssl rand -base64 32>
KAFKA_BROKERS=localhost:9092
REDIS_HOST=localhost
REDIS_PORT=6379
PORT=3000
```

### Frontend (.env.local)
```bash
NEXT_PUBLIC_API_URL=http://localhost:3000/api
NEXT_PUBLIC_WS_URL=http://localhost:3000
```

---

## Common Tasks

### Adding a New Platform
1. Create `platforms/adapters/{platform}.adapter.ts` extending `BasePlatformAdapter`
2. Implement required methods: `verifySignature()`, `extractAccountId()`, `extractEvents()`, `normalizeMessage()`, etc.
3. Add `Platform.{PLATFORM}` to enum in `common/constants/platforms.constant.ts`
4. Create platform-specific module in `platforms/{platform}/`
5. Register adapter in `PlatformRegistry`

### Embedding the Widget
1. Fetch widget configuration: `GET /api/widget/{orgSlug}/config`
2. Initialize widget script with returned configuration
3. Widget communicates via WebSocket directly to VisitorGateway
4. Messages normalized through WebPlatformAdapter

### Sending Messages
1. Frontend calls `POST /api/messages/send` with conversationId and content
2. Message saved with `status: 'pending'`
3. Published to Kafka `messages.outgoing` topic
4. Platform sender consumes and calls external API
5. Status updated to `'sent'` and pushed via WebSocket

---

## API Documentation Index

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/widget/:orgSlug/config` | GET | ❌ | Get widget configuration |
| `/auth/login` | POST | ❌ | User login |
| `/auth/refresh` | POST | ❌ | Refresh JWT token |
| `/conversations` | GET | ✅ | List conversations |
| `/conversations/:id` | GET | ✅ | Get conversation |
| `/conversations/:id` | PATCH | ✅ | Update conversation |
| `/conversations/:id/messages` | GET | ✅ | List messages |
| `/messages/send` | POST | ✅ | Send message |
| `/connections` | GET | ✅ | List connections |
| `/connections/:platform/auth-url` | GET | ✅ | Get OAuth URL |

---

## Contributing

When adding new features or modules:

1. Update relevant documentation files
2. Maintain consistent code formatting and naming conventions
3. Add API documentation for new endpoints
4. Include code examples in relevant guides
5. Update this index if creating new documentation files

---

## Version Information

**Project Version:** Phase 1
**Documentation Updated:** 2025-01-16
**Backend:** NestJS 10, Node.js 20+
**Frontend:** Next.js 16 RC, React 19
**Database:** MongoDB 8
**Message Broker:** Kafka
**Cache:** Redis

---

## Support

For questions about the documentation:
- Check the relevant section in [system-architecture.md](./system-architecture.md)
- Review examples in [api-docs.md](./api-docs.md)
- Refer to code comments in `backend/src` and `frontend`

---

Last Updated: 2025-01-16
Maintained by: Technical Documentation Team
