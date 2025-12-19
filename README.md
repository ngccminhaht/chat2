# Omnichannel Chat Platform

Nền tảng chat đa kênh hỗ trợ Facebook Messenger, Zalo OA, TikTok Shop, và Shopee. Quản lý tin nhắn tập trung với real-time synchronization qua WebSocket.

## 🏗️ Kiến trúc

### Tech Stack

**Backend:**

- NestJS 10 (Node.js framework)
- MongoDB 8 (Database với Mongoose ODM)
- Kafka (Message streaming)
- Redis (WebSocket adapter & caching)
- Socket.IO (Real-time WebSocket)
- JWT (Authentication)

**Frontend:**

- Next.js 16 RC (React framework với App Router)
- MUI 7 (Material-UI components - chỉ dùng components có sẵn)
- Zustand (State management)
- TanStack Query (Server state management)
- Socket.IO Client (Real-time updates)
- Axios (HTTP client)

### Cấu trúc thư mục

```
miagent/
├── backend/                    # NestJS API
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/          # JWT authentication
│   │   │   ├── users/         # User management
│   │   │   ├── organizations/ # Multi-tenant organizations
│   │   │   ├── conversations/ # Conversation management
│   │   │   ├── messages/      # Message handling
│   │   │   ├── webhooks/      # Platform webhook receivers
│   │   │   ├── websocket/     # Socket.IO gateway
│   │   │   ├── platform-connections/  # OAuth connections
│   │   │   └── media/         # Media file handling
│   │   ├── common/
│   │   │   ├── database/
│   │   │   │   └── schemas/  # MongoDB schemas
│   │   │   ├── kafka/        # Kafka producers/consumers
│   │   │   ├── guards/       # Auth guards
│   │   │   └── decorators/   # Custom decorators
│   │   ├── app.module.ts
│   │   └── main.ts
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/                   # Next.js 16 App
│   ├── app/
│   │   ├── (auth)/            # Auth pages (login, register)
│   │   ├── (dashboard)/       # Dashboard pages (conversations, settings)
│   │   ├── api/               # API routes
│   │   ├── layout.tsx         # Root layout
│   │   ├── providers.tsx      # React Query provider
│   │   └── page.tsx           # Home page
│   ├── components/
│   │   ├── conversations/     # Conversation components
│   │   ├── layout/            # Layout components (Sidebar, Header)
│   │   └── common/            # Shared components
│   ├── lib/
│   │   ├── api/               # API client (axios)
│   │   ├── websocket/         # WebSocket client
│   │   ├── stores/            # Zustand stores
│   │   └── theme.ts           # MUI theme
│   ├── hooks/                 # Custom React hooks
│   ├── types/                 # TypeScript types
│   ├── package.json
│   └── tsconfig.json
│
└── docker-compose.yml         # MongoDB + Kafka + Redis
```

## 📊 MongoDB Schemas

### User

```typescript
{
  email: string(unique);
  passwordHash: string;
  name: string;
  organizationId: ObjectId;
  role: "admin" | "agent" | "viewer";
  settings: {
    notifications, language;
  }
  isActive: boolean;
}
```

### Organization

```typescript
{
  name: string;
  settings: {
    timezone, workingHours, autoAssignment;
  }
  isActive: boolean;
}
```

### PlatformConnection

```typescript
{
  userId: ObjectId
  organizationId: ObjectId
  platform: 'facebook' | 'zalo' | 'tiktok' | 'shopee'
  platformAccountId: string
  platformAccountName: string
  credentials: { accessToken, refreshToken, expiresAt, scopes }
  status: 'active' | 'expired' | 'error'
  webhookSecret: string
  metadata: { pageId, oaId, shopId, ... }
  lastSyncAt: Date
}
```

### Conversation

```typescript
{
  organizationId: ObjectId
  platform: string
  platformConversationId: string
  platformConnectionId: ObjectId
  participants: [{ platformUserId, name, avatar, role }]
  status: 'open' | 'closed' | 'archived'
  assignedTo: ObjectId
  tags: string[]
  lastMessage: { text, timestamp, senderId, messageId }  // Denormalized
  unreadCount: number
  metadata: {}
}
```

### Message

```typescript
{
  conversationId: ObjectId
  organizationId: ObjectId
  platform: string
  platformMessageId: string
  direction: 'inbound' | 'outbound'
  type: 'text' | 'image' | 'video' | 'file' | 'sticker' | 'audio'
  content: { text, mediaUrl, mediaType, thumbnailUrl, fileName, fileSize }
  sender: { platformUserId, name, avatar }
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
  metadata: { rawPayload, error, ... }
}
```

## 🔄 Message Flow Architecture

### Inbound (Platform → Frontend)

```
Facebook/Zalo Webhook
  ↓ (POST /webhooks/{platform})
Webhook Handler (verify signature)
  ↓ (publish)
Kafka: platform.webhooks.raw
  ↓ (consume)
Message Processor
  ↓ (normalize + save to MongoDB)
Kafka: websocket.notifications
  ↓ (consume)
WebSocket Bridge
  ↓ (emit via Socket.IO)
Frontend receives event
```

### Outbound (Frontend → Platform)

```
User sends message in UI
  ↓ (POST /api/messages/send)
API Handler (save to DB with status: 'pending')
  ↓ (publish)
Kafka: messages.outgoing
  ↓ (consume)
Platform Sender (call Facebook/Zalo API)
  ↓ (update status: 'sent')
Kafka: websocket.notifications
  ↓ (emit via Socket.IO)
Frontend updates status
```

## 🌐 WebSocket Events

### Client → Server

- `join:conversation` - Join conversation room
- `leave:conversation` - Leave conversation room
- `typing:start` - User starts typing
- `typing:stop` - User stops typing
- `message:read` - Mark message as read

### Server → Client

- `message:new` - New message received
- `message:status` - Message status changed (sent/delivered/read)
- `conversation:updated` - Conversation metadata updated
- `typing:indicator` - Someone is typing
- `user:online` - Team member online
- `user:offline` - Team member offline

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- Yarn
- Docker & Docker Compose

### 1. Start infrastructure services

```bash
docker-compose up -d
```

Services will start:

- MongoDB: `localhost:27017`
- Kafka: `localhost:9092`
- Redis: `localhost:6379`
- Zookeeper: `localhost:2181`

### 2. Setup Backend

```bash
cd backend

# Copy environment file
cp .env.example .env

# Edit .env with your credentials
# - JWT_SECRET
# - JWT_REFRESH_SECRET
# - FB_APP_ID, FB_APP_SECRET, FB_VERIFY_TOKEN
# - ZALO_APP_ID, ZALO_APP_SECRET
# etc.

# Install dependencies
yarn install

# Run in development mode
yarn start:dev
```

Backend will start on `http://localhost:3000`

### 3. Setup Frontend

```bash
cd frontend

# Copy environment file
cp .env.local.example .env.local

# Install dependencies
yarn install

# Run in development mode
yarn dev
```

Frontend will start on `http://localhost:3001`

## 📋 Development Checklist

### Phase 1: Foundation ✅

- [x] NestJS project structure với modules
- [x] MongoDB schemas (User, Organization, PlatformConnection, Conversation, Message)
- [x] JWT authentication module
- [x] Docker Compose (MongoDB + Kafka + Redis)
- [x] Next.js 16 frontend setup
- [x] MUI + Zustand + TanStack Query configuration
- [x] WebSocket client setup

### Phase 2: WebSocket Infrastructure ✅

- [x] Socket.IO Gateway trong NestJS
- [x] Redis adapter cho horizontal scaling
- [x] WebSocket authentication middleware
- [x] Room-based architecture (user rooms, conversation rooms)
- [x] Kafka → WebSocket bridge
- [x] Frontend WebSocket integration với Zustand

### Phase 3: Core Messaging ✅

- [x] Kafka topics setup
- [x] Message normalization service
- [x] REST APIs (conversations, messages)
- [x] Frontend: Conversation list component
- [x] Frontend: Message list với infinite scrolling
- [x] Frontend: Message input component
- [x] Typing indicators UI
- [x] Message status icons

### Phase 4: Facebook Messenger Integration ✅

- [x] Facebook OAuth flow
- [x] Webhook handler với signature verification
- [x] Message adapters (normalize + send)
- [x] Handle các message types (text, image, video, audio, file, sticker, location)
- [x] Media download service (S3/MinIO)
- [x] Comments/Feed events handling
- [x] Postback handling

### Phase 5: Zalo OA Integration ✅

- [x] Zalo OAuth flow with PKCE
- [x] Webhook handlers with signature verification
- [x] Message adapters (all message types)
- [x] Token refresh mechanism
- [x] File upload support
- [x] User profile fetching

### Phase 6: Advanced Features ✅

- [x] Typing indicators
- [x] Read receipts
- [x] Media handling (S3/MinIO)
- [x] Team assignment (human agents + AI agents)
- [x] Quick replies & templates
- [x] Search & filters (server-side search)
- [x] Customer info panel (status, assignment, tags)
- [x] AI Agents management (external platform integration)
- [x] Settings page (Profile, Notifications, Team, AI Agents, Organization)

## 🔧 Available Scripts

### Backend

```bash
yarn dev    # Development mode với hot reload
yarn start:prod   # Production mode
yarn build        # Build TypeScript
yarn lint         # Lint code
yarn test         # Run tests
```

### Frontend

```bash
yarn dev          # Development mode (port 3001)
yarn build        # Production build
yarn start        # Start production server
yarn lint         # Lint code
yarn type-check   # TypeScript type checking
```

## 📝 Environment Variables

### Backend (.env)

```env
NODE_ENV=development
PORT=3000

MONGODB_URI=mongodb://localhost:27017/omnichat
KAFKA_BROKERS=localhost:9092
REDIS_HOST=localhost
REDIS_PORT=6379

JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

FB_APP_ID=your-facebook-app-id
FB_APP_SECRET=your-facebook-app-secret
FB_VERIFY_TOKEN=your-verify-token

ZALO_APP_ID=your-zalo-app-id
ZALO_APP_SECRET=your-zalo-app-secret
```

### Frontend (.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api
NEXT_PUBLIC_WS_URL=http://localhost:3000
```

## 🏛️ Architecture Decisions

1. **MongoDB vs PostgreSQL**: Chọn MongoDB vì schema flexibility cho platform-specific data và write performance tốt hơn cho chat workload

2. **Modular Monolith**: Bắt đầu với monolith modular trong NestJS, có thể extract thành microservices sau nếu cần

3. **Kafka cho Message Streaming**: Decouple webhook receipt từ processing, enable message replay, support multiple consumers

4. **WebSocket với Socket.IO**: Real-time bidirectional communication, auto-reconnect, fallback to polling

5. **Zustand + TanStack Query**: Zustand cho client state (UI, active conversation), TanStack Query cho server state (conversations, messages)

## 📚 References

- [NestJS Documentation](https://docs.nestjs.com)
- [Next.js 16 Documentation](https://nextjs.org/docs)
- [MUI Documentation](https://mui.com)
- [Kafka Documentation](https://kafka.apache.org/documentation)
- [Socket.IO Documentation](https://socket.io/docs)
- [Facebook Messenger Platform](https://developers.facebook.com/docs/messenger-platform)
- [Zalo OA Documentation](https://developers.zalo.me/docs)

## 📄 License

MIT
