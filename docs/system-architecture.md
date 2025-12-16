# System Architecture

Comprehensive architecture documentation for the Omnichannel Chat Platform.

## Overview

Multi-platform chat management system supporting:
- **Facebook Messenger** - via webhooks and OAuth
- **Zalo OA** - via webhooks and OAuth
- **TikTok Shop** - via webhooks and OAuth
- **Shopee** - via webhooks and OAuth
- **Web Chat Widget** - via WebSocket (new in Phase 1)

### Key Architectural Principles

1. **Platform Abstraction** - All platforms implement a common adapter interface
2. **Message Normalization** - Platform-specific formats converted to unified internal format
3. **Asynchronous Processing** - Kafka decouples real-time reception from processing
4. **Real-time Sync** - WebSocket (Socket.IO) for bidirectional client-server communication
5. **Modular Design** - Feature-based modules with clear separation of concerns

---

## Platform Adapter Architecture

### Adapter Pattern

All platform integrations use the **Adapter Pattern** with a shared interface:

**File:** `backend/src/modules/platforms/core/interfaces/platform-adapter.interface.ts`

```typescript
export interface IPlatformAdapter {
  readonly platform: Platform;

  // Webhook verification (signature-based platforms)
  verifySignature(rawBody: string, signature: string, secret: string): boolean;

  // Extract platform account ID from webhook payload
  extractAccountId(payload: unknown): string;

  // Extract events from webhook payload
  extractEvents(payload: unknown): PlatformEvent[];

  // Normalize platform event to internal format
  normalizeMessage(event: MessageEvent): NormalizedMessage;

  // Create conversation key from participants
  getConversationKey(senderId: string, recipientId: string, payload?: unknown): string;

  // Format outbound message for platform API
  formatOutbound(message: OutboundMessage): PlatformPayload;

  // Send message via platform API
  send(connection: PlatformConnectionDocument, recipientId: string, payload: PlatformPayload): Promise<SendResult>;

  // Fetch user profile from platform
  fetchUserProfile(connection: PlatformConnectionDocument, userId: string): Promise<UserProfile>;
}
```

### Base Implementation

**File:** `backend/src/modules/platforms/adapters/base.adapter.ts`

Provides common functionality:
- Helper methods for finding connections and conversations
- Message deduplication logic
- Default user profile creation
- Template Method pattern for extending

### Platform Adapters

#### 1. Facebook Adapter
```
backend/src/modules/platforms/adapters/facebook.adapter.ts
```
- Handles Messenger webhook format
- HMAC signature verification
- Message type conversions (text, images, stickers, etc.)
- Conversation key: `facebook_{pageId}_{senderId}`

#### 2. Zalo Adapter
```
backend/src/modules/platforms/adapters/zalo.adapter.ts
```
- Handles Zalo OA webhook format
- Signature verification with Zalo token
- Rich message support (stickers, quick replies)
- Conversation key: `zalo_{oaId}_{senderId}`

#### 3. Shopee Adapter
```
backend/src/modules/platforms/adapters/shopee.adapter.ts
```
- Handles Shopee webhook format
- Partner key signature verification
- Order-related message context
- Conversation key: `shopee_{shopId}_{userId}`

#### 4. TikTok Adapter
```
backend/src/modules/platforms/adapters/tiktok.adapter.ts
```
- Handles TikTok Shop webhook format
- Message streaming integration
- Conversation key: `tiktok_{shopId}_{userId}`

#### 5. Web Platform Adapter ★ NEW
```
backend/src/modules/platforms/adapters/web.adapter.ts
```

**Purpose:** Handle web chat widget messages via WebSocket

**Key Differences from Other Platforms:**
- No webhook verification (uses WebSocket auth instead)
- Direct message injection (no external API polling)
- Visitor-based conversations (no user accounts)
- Single event per message (no batched webhooks)

**Implementation:**
```typescript
@Injectable()
export class WebPlatformAdapter extends BasePlatformAdapter {
  readonly platform = Platform.WEB;

  /**
   * Web platform uses WebSocket auth, not webhook signatures
   * Always returns true - actual auth handled by WebSocket gateway
   */
  verifySignature(): boolean {
    return true;
  }

  /**
   * Extract organization ID from payload
   * (not a platform account - visitor chats with organization)
   */
  extractAccountId(payload: unknown): string {
    const webPayload = payload as WebMessagePayload;
    return webPayload.organizationId || 'unknown';
  }

  /**
   * Web messages come directly via WebSocket, not batched
   * Returns single event array
   */
  extractEvents(payload: unknown): PlatformEvent[] {
    const msg = payload as WebMessagePayload;

    const event: MessageEvent = {
      type: 'message',
      senderId: msg.visitorId,
      recipientId: msg.organizationId,
      timestamp: new Date(msg.timestamp || Date.now()),
      messageId: msg.messageId || randomUUID(),
      messageType: msg.type || MessageType.TEXT,
      content: {
        text: msg.text,
        mediaUrl: msg.mediaUrl,
        mediaType: msg.mediaType,
        fileName: msg.fileName,
        fileSize: msg.fileSize,
      },
      rawPayload: payload,
    };

    return [event];
  }

  /**
   * Conversation key format: web_{organizationId}_{visitorId}
   */
  getConversationKey(visitorId: string, organizationId: string): string {
    return `web_${organizationId}_${visitorId}`;
  }

  /**
   * Web messages sent via WebSocket, not external API
   * Actual WebSocket emit happens in VisitorGateway
   */
  async send(
    connection: PlatformConnectionDocument,
    recipientId: string,
    payload: PlatformPayload,
  ): Promise<SendResult> {
    const messageId = randomUUID();
    return {
      success: true,
      platformMessageId: messageId,
    };
  }
}
```

**Message Payload Interface:**
```typescript
export interface WebMessagePayload {
  visitorId: string;              // Unique visitor identifier
  organizationId: string;          // Target organization
  messageId?: string;              // Optional - generated if missing
  type?: MessageType;              // TEXT, IMAGE, FILE, etc.
  text?: string;                   // Message text
  mediaUrl?: string;               // Media file URL
  mediaType?: string;              // Media MIME type
  fileName?: string;               // For file attachments
  fileSize?: number;               // File size in bytes
  timestamp?: number;              // Message timestamp (uses current if missing)
}
```

### Adapter Registry

**File:** `backend/src/modules/platforms/core/platform-registry.service.ts`

Centralized adapter management:
```typescript
@Injectable()
export class PlatformRegistry {
  private adapters = new Map<Platform, IPlatformAdapter>();

  register(adapter: IPlatformAdapter) {
    this.adapters.set(adapter.platform, adapter);
  }

  get(platform: Platform): IPlatformAdapter {
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new PlatformNotSupportedError(platform);
    }
    return adapter;
  }

  getAll(): IPlatformAdapter[] {
    return Array.from(this.adapters.values());
  }
}
```

---

## Message Flow Architecture

### Inbound Message Flow

#### For Webhook-based Platforms (Facebook, Zalo, Shopee, TikTok)

```
External Platform Webhook
  ↓ (POST /webhooks/{platform})
Webhook Controller (signature verification)
  ↓ (publish to Kafka)
Kafka: platform.webhooks.raw
  ↓ (consumed by)
Webhook Processor Service
  ↓ (1. adapter.extractAccountId())
  ↓ (2. adapter.extractEvents())
  ↓ (3. findOrCreateConversation())
  ↓ (4. adapter.normalizeMessage())
  ↓ (5. saveMessage to MongoDB)
  ↓ (publish to Kafka)
Kafka: websocket.notifications
  ↓ (consumed by)
WebSocket Bridge Consumer
  ↓ (emit via Socket.IO)
Frontend WebSocket Client
  ↓ (update UI via Zustand)
User sees new message
```

#### For Web Platform (Direct WebSocket)

```
Widget JavaScript → WebSocket Connection
  ↓ (Socket.IO event: new-message)
VisitorGateway (WebSocket handler)
  ↓ (create WebMessagePayload)
Webhook Processor Service
  ↓ (adapter.extractAccountId() returns orgId)
  ↓ (adapter.extractEvents() returns single event)
  ↓ (findOrCreateConversation())
  ↓ (adapter.normalizeMessage())
  ↓ (saveMessage to MongoDB)
  ↓ (publish to Kafka)
Kafka: websocket.notifications
  ↓ (consumed by)
WebSocket Bridge Consumer
  ↓ (emit via Socket.IO to admin users)
Dashboard sees new chat
```

### Outbound Message Flow

```
Agent Types Message in Dashboard
  ↓ (POST /api/messages/send)
Messages Controller
  ↓ (save with status: 'pending')
  ↓ (publish to Kafka)
Kafka: messages.outgoing
  ↓ (consumed by)
Platform Sender Consumer
  ↓ (find adapter for platform)
  ↓ (adapter.formatOutbound())
  ↓ (adapter.send() → calls platform API)
  ↓ (update status: 'sent')
  ↓ (publish to Kafka)
Kafka: websocket.notifications
  ↓ (consumed by)
WebSocket Bridge Consumer
  ↓ (emit message:status to client)
Dashboard shows 'sent' status
```

---

## Module Organization

### Backend Structure

```
backend/src/
├── common/                           # Shared infrastructure
│   ├── base/
│   │   ├── base-platform.adapter.ts  # Base class for all adapters
│   │   └── base-oauth.service.ts     # Base class for OAuth
│   ├── constants/
│   │   ├── platforms.constant.ts     # Platform enum + metadata
│   │   ├── statuses.constant.ts      # Status enums
│   │   └── api-endpoints.constant.ts # API endpoints
│   ├── database/
│   │   └── schemas/
│   │       ├── organization.schema.ts
│   │       ├── user.schema.ts
│   │       ├── conversation.schema.ts
│   │       ├── message.schema.ts
│   │       └── platform-connection.schema.ts
│   ├── env/
│   │   ├── env.service.ts            # Type-safe env access
│   │   └── env.module.ts
│   ├── guards/
│   │   └── jwt-auth.guard.ts         # JWT validation
│   ├── decorators/
│   │   ├── public.decorator.ts       # Skip auth (for widget endpoint)
│   │   └── organization-id.decorator.ts
│   └── types/
│       ├── webhook-payloads.types.ts # Webhook type definitions
│       └── dto.types.ts              # Data transfer objects
│
├── modules/
│   ├── auth/
│   │   ├── auth.controller.ts        # Login, refresh, register
│   │   ├── auth.service.ts
│   │   ├── strategies/
│   │   │   └── jwt.strategy.ts
│   │   └── auth.module.ts
│   │
│   ├── organizations/
│   │   ├── organizations.service.ts
│   │   ├── organizations.controller.ts
│   │   └── organizations.module.ts
│   │
│   ├── conversations/
│   │   ├── conversations.service.ts
│   │   ├── conversations.controller.ts
│   │   └── conversations.module.ts
│   │
│   ├── messages/
│   │   ├── messages.service.ts
│   │   ├── messages.controller.ts
│   │   └── messages.module.ts
│   │
│   ├── widget/ ★ NEW
│   │   ├── widget.controller.ts      # GET /api/widget/:orgSlug/config
│   │   ├── widget.service.ts         # Fetch organization widget settings
│   │   ├── dto/
│   │   │   └── widget-config.dto.ts
│   │   └── widget.module.ts
│   │
│   ├── platforms/
│   │   ├── core/
│   │   │   ├── interfaces/
│   │   │   │   └── platform-adapter.interface.ts
│   │   │   ├── platform-registry.service.ts
│   │   │   └── platform.module.ts
│   │   │
│   │   ├── adapters/
│   │   │   ├── base.adapter.ts
│   │   │   ├── facebook.adapter.ts
│   │   │   ├── zalo.adapter.ts
│   │   │   ├── shopee.adapter.ts
│   │   │   ├── tiktok.adapter.ts
│   │   │   └── web.adapter.ts ★ NEW
│   │   │
│   │   ├── facebook/
│   │   ├── zalo/
│   │   ├── shopee/
│   │   ├── tiktok/
│   │   └── web/ ★ NEW
│   │
│   ├── websocket/
│   │   ├── gateways/
│   │   │   ├── chat.gateway.ts       # Main chat WebSocket
│   │   │   └── visitor.gateway.ts ★ NEW  # Web widget WebSocket
│   │   ├── websocket.module.ts
│   │   └── events.enum.ts
│   │
│   └── connections/
│       ├── connections.service.ts    # Platform connection management
│       ├── connections.controller.ts
│       ├── facebook-oauth.service.ts
│       ├── zalo-oauth.service.ts
│       ├── shopee-oauth.service.ts
│       ├── tiktok-oauth.service.ts
│       └── connections.module.ts
│
├── app.module.ts                     # Root module
└── main.ts                           # Bootstrap
```

### Frontend Structure

```
frontend/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── register/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   │
│   ├── (dashboard)/
│   │   ├── conversations/
│   │   │   ├── page.tsx
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   ├── settings/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   │
│   ├── layout.tsx                    # Root layout
│   ├── providers.tsx                 # React Query provider
│   └── page.tsx                      # Home page
│
├── components/
│   ├── common/
│   │   ├── LoadingSpinner.tsx
│   │   └── ErrorBoundary.tsx
│   └── layout/
│       ├── Sidebar.tsx
│       └── Header.tsx
│
├── features/
│   ├── auth/
│   │   ├── components/
│   │   │   ├── LoginForm.tsx
│   │   │   └── RegisterForm.tsx
│   │   └── hooks/
│   │       └── useLogin.ts
│   │
│   ├── conversations/
│   │   ├── components/
│   │   │   ├── ConversationList.tsx
│   │   │   └── MessageList.tsx
│   │   └── hooks/
│   │       └── useMessages.ts
│   │
│   └── platform-connections/
│       ├── components/
│       │   └── PlatformConnectionCard.tsx
│       └── hooks/
│           └── usePlatformConnection.ts
│
├── lib/
│   ├── api/
│   │   └── client.ts                 # Axios client with auto token refresh
│   ├── websocket/
│   │   └── client.ts                 # Socket.IO client
│   ├── constants/
│   │   ├── platforms.ts              # Platform enum (mirrors backend)
│   │   └── statuses.ts
│   ├── stores/
│   │   ├── authStore.ts              # Zustand store for auth
│   │   └── conversationStore.ts      # Zustand store for conversations
│   └── theme.ts                      # MUI theme configuration
│
├── hooks/
│   ├── useWebSocket.ts               # WebSocket setup
│   └── useAuth.ts                    # Auth wrapper hook
│
├── types/
│   ├── api.types.ts                  # API response types
│   └── widget.types.ts ★ NEW         # Widget configuration types
│
├── public/
│   ├── widget.js ★ NEW               # Widget embed script
│   └── widget.css ★ NEW              # Widget styles
│
└── env.local                          # Frontend environment config
```

---

## Database Schema

### Organization

```typescript
{
  _id: ObjectId;
  name: string;                        // Organization name
  slug: string;                        // URL-friendly identifier
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  widgetSettings?: {                   // ★ NEW - Web widget config
    primaryColor?: string;             // e.g., "#0066FF"
    position?: 'left' | 'right';
    greeting?: string;
    logo?: string;
    offlineMessage?: string;
    preChatForm?: boolean;
    preChatFields?: string[];
  };
  settings: {
    timezone?: string;
    workingHours?: { start: string; end: string };
    autoAssignment?: boolean;
  };
}
```

### Conversation

```typescript
{
  _id: ObjectId;
  organizationId: ObjectId;
  platform: Platform;                  // 'facebook' | 'zalo' | 'shopee' | 'tiktok' | 'web'
  platformConversationId: string;      // Platform-specific ID or web_{org}_{visitor}
  platformConnectionId?: ObjectId;     // Reference to connection (null for web platform)

  participants: [{
    platformUserId: string;
    name: string;
    avatar?: string;
    role: 'customer' | 'agent' | 'bot';
  }];

  status: 'open' | 'pending' | 'resolved' | 'closed';
  assignedTo?: ObjectId;               // Assigned agent user ID

  lastMessage?: {                      // Denormalized for fast list queries
    text: string;
    timestamp: Date;
    senderId: string;
    messageId: ObjectId;
  };

  unreadCount: number;
  tags: string[];
  metadata: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}
```

### Message

```typescript
{
  _id: ObjectId;
  conversationId: ObjectId;
  organizationId: ObjectId;

  platform: Platform;
  platformMessageId: string;           // Unique per platform
  direction: 'inbound' | 'outbound';

  type: 'text' | 'image' | 'video' | 'file' | 'sticker' | 'audio' | 'location';

  content: {
    text?: string;
    mediaUrl?: string;
    mediaType?: string;
    thumbnailUrl?: string;
    fileName?: string;
    fileSize?: number;
    latitude?: number;
    longitude?: number;
  };

  sender: {
    platformUserId: string;
    name: string;
    avatar?: string;
  };

  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

  metadata: {
    rawPayload?: unknown;
    error?: string;
  };

  createdAt: Date;
  updatedAt: Date;

  // Text index for search
  // Index: { conversationId, platform, platformMessageId } (unique)
}
```

### Platform Connection

```typescript
{
  _id: ObjectId;
  organizationId: ObjectId;
  userId: ObjectId;

  platform: Platform;
  platformAccountId: string;           // Facebook page ID, Zalo OA ID, etc.
  platformAccountName: string;

  credentials: {
    accessToken: string;               // Encrypted before storage
    refreshToken?: string;
    expiresAt?: Date;
    scopes: string[];
  };

  status: 'active' | 'expired' | 'error';
  webhookSecret: string;               // For webhook signature verification

  metadata: {                           // Platform-specific data
    pageId?: string;                   // Facebook
    oaId?: string;                     // Zalo
    shopId?: string;                   // Shopee/TikTok
    userId?: string;                   // TikTok Shop
  };

  lastSyncAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

---

## Constants

**File:** `backend/src/common/constants/platforms.constant.ts`

```typescript
export enum Platform {
  FACEBOOK = 'facebook',
  ZALO = 'zalo',
  TIKTOK = 'tiktok',
  SHOPEE = 'shopee',
  WEB = 'web',  // ★ NEW
}

export const PLATFORM_DISPLAY_NAMES: Record<Platform, string> = {
  [Platform.FACEBOOK]: 'Facebook Messenger',
  [Platform.ZALO]: 'Zalo OA',
  [Platform.TIKTOK]: 'TikTok Shop',
  [Platform.SHOPEE]: 'Shopee',
  [Platform.WEB]: 'Web Chat',  // ★ NEW
};

export const PLATFORM_API_VERSIONS: Record<Platform, string> = {
  [Platform.FACEBOOK]: 'v19.0',
  [Platform.ZALO]: 'v2.0',
  [Platform.TIKTOK]: 'v1.0',
  [Platform.SHOPEE]: 'v2.0',
  [Platform.WEB]: 'v1.0',  // ★ NEW
};

export const PLATFORM_OAUTH_SCOPES: Record<Platform, string> = {
  [Platform.FACEBOOK]: '...',
  [Platform.ZALO]: '...',
  [Platform.TIKTOK]: '...',
  [Platform.SHOPEE]: '...',
  [Platform.WEB]: '',  // ★ NEW - No OAuth needed for widget
};
```

---

## API Endpoint Summary

### Public Endpoints (No Auth)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/widget/:orgSlug/config` | Widget configuration for embedding |

### Authenticated Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/conversations` | List conversations |
| GET | `/api/conversations/:id` | Get conversation details |
| POST | `/api/messages/send` | Send message |
| GET | `/api/conversations/:id/messages` | Get conversation messages |
| GET | `/api/connections` | List platform connections |
| GET | `/api/connections/:platform/auth-url` | Get OAuth URL |

### WebSocket Endpoints

| Event | Direction | Purpose |
|-------|-----------|---------|
| `join:conversation` | C→S | Subscribe to conversation messages |
| `leave:conversation` | C→S | Unsubscribe from conversation |
| `message:new` | S→C | New message received |
| `message:status` | S→C | Message status updated |
| `typing:indicator` | S→C | User typing indicator |

---

## Environment Configuration

**Backend (.env):**
- MONGODB_URI - MongoDB connection
- JWT_SECRET - JWT signing key
- KAFKA_BROKERS - Kafka broker addresses
- REDIS_HOST, REDIS_PORT - Redis cache
- Platform credentials (FB_APP_ID, ZALO_APP_ID, etc.)

**Frontend (.env.local):**
- NEXT_PUBLIC_API_URL - Backend API base URL
- NEXT_PUBLIC_WS_URL - WebSocket server URL

---

## Security Considerations

### Authentication & Authorization
- JWT-based authentication for all protected endpoints
- Refresh token flow for long-lived sessions
- Platform connections encrypted with AES-256-GCM
- WebSocket authenticated via JWT in connection handshake

### CORS & CSRF
- CORS enabled for widget public endpoint (all origins)
- CORS restricted for authenticated endpoints
- CSRF protection via SameSite cookies

### Data Privacy
- Organization data isolation via organizationId
- Platform credentials encrypted at rest
- API keys never logged in plain text
- Rate limiting on authentication endpoints

### Webhook Security
- Signature verification for all platform webhooks
- Webhook secret stored per platform connection
- Idempotent processing via platformMessageId deduplication

---

## Deployment Architecture

### Development
- Single machine Docker Compose with all services
- Hot reload for backend (NestJS) and frontend (Next.js)
- In-memory databases for rapid testing

### Production
- Containerized NestJS backend
- Containerized Next.js frontend
- MongoDB Atlas or self-hosted cluster
- Kafka cluster with 3+ brokers
- Redis cluster for session/cache
- Load balanced API endpoints

---

## Scaling Strategy

### Horizontal Scaling
- Backend: Stateless NestJS instances behind load balancer
- Redis Adapter for Socket.IO ensures WebSocket sticky sessions
- Kafka partitioning enables parallel processing

### Vertical Scaling
- Increase MongoDB indexes and query optimization
- Redis memory for high-traffic conversations
- Kafka consumer groups for load distribution

### Monitoring
- Application logs via structured logging
- Performance metrics via Prometheus
- Error tracking via Sentry
- Real-time alerts via PagerDuty

