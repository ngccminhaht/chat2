# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Omnichannel chat platform supporting Facebook Messenger, Zalo OA, TikTok Shop, and Shopee. Centralized message management with real-time WebSocket synchronization. Monorepo with separate backend (NestJS) and frontend (Next.js 16 RC).

## Development Commands

### Infrastructure

```bash
# Start all services (MongoDB, Kafka KRaft, Redis)
docker-compose up -d

# Stop all services
docker-compose down

# View logs
docker-compose logs -f [service-name]
```

### Backend (NestJS)

```bash
cd backend

# Development (hot reload on port 3000)
yarn dev

# Production build and run
yarn build
yarn start:prod

# Type checking
tsc --noEmit
```

### Frontend (Next.js 16)

```bash
cd frontend

# Development (port 3001)
yarn dev

# Production build
yarn build
yarn start

# Type checking
yarn type-check
```

## Architecture Overview

### Message Flow Pattern

**Inbound messages** follow this asynchronous pipeline:

1. Platform webhook → Webhook handler (signature verification)
2. Publish to Kafka (`platform.webhooks.raw`)
3. Message processor consumes, normalizes, saves to MongoDB
4. Publish to Kafka (`websocket.notifications`)
5. WebSocket bridge emits to Socket.IO clients
6. Frontend receives real-time update

**Outbound messages** follow:

1. Frontend POST to `/api/messages/send` (saved as `status: 'pending'`)
2. Publish to Kafka (`messages.outgoing`)
3. Platform sender consumes, calls external API
4. Update status to `'sent'`, publish to `websocket.notifications`
5. Frontend receives status update via WebSocket

### State Management (Frontend)

- **Zustand stores**: Client state (UI, active conversation, typing indicators)

  - `authStore`: User, JWT tokens (persisted to localStorage)
  - `conversationStore`: Active conversation, conversations list, messages cache, typing users

- **TanStack Query**: Server state (API data fetching, caching, invalidation)

  - Use with `lib/api/client.ts` (axios instance with auto token refresh)

- **WebSocket client** (`lib/websocket/client.ts`): Singleton that integrates with Zustand stores, auto-reconnect logic

### MongoDB Schema Design

**Key decisions:**

- **Conversation schema** denormalizes `lastMessage` for fast list queries (avoid JOIN on messages collection)
- **Message schema** uses text index on `content.text` for search
- Platform-specific data stored in `metadata` field (flexible schema per platform)
- Unique indexes on `platform + platformMessageId` and `platform + platformConversationId` for idempotency

### Module Organization (Backend)

Path alias `@/*` maps to `src/*`. All modules in `src/modules/`:

- **auth**: JWT strategy, login/register/refresh endpoints
- **users**: User CRUD with role-based access
- **conversations**, **messages**: Core chat entities
- **webhooks**: Platform-specific webhook receivers (Facebook, Zalo)
- **websocket**: Socket.IO gateway with room-based architecture
- **platform-connections**: OAuth flows, credential storage
- **media**: File upload/download, media storage

Common utilities in `src/common/`:

- `database/schemas`: Mongoose schemas exported as barrel
- `kafka`: Producers and consumers (to be implemented)
- `guards`: JWT auth guards
- `decorators`: Custom parameter decorators
- `env`: Type-safe environment variable service

### Environment Configuration (Backend)

**EnvService** provides type-safe access to environment variables with runtime validation using `class-validator`.

**Location:** `backend/src/common/env/`

**Key files:**

- `env.schema.ts`: Defines all environment variables with validation decorators
- `env.service.ts`: Simple service with generic `get()` method
- `env.module.ts`: Global module with validation logic

**Usage pattern:**

```typescript
import { EnvService } from "@/common/env";

@Injectable()
export class MyService {
  constructor(private readonly envService: EnvService) {}

  myMethod() {
    // ✅ CORRECT - Type-safe access with autocomplete
    const port = this.envService.get("PORT"); // Type: number
    const mongoUri = this.envService.get("MONGODB_URI"); // Type: string
    const corsOrigins = this.envService.get("CORS_ORIGINS"); // Type: string[]

    // ❌ WRONG - Never access process.env directly
    const port = process.env.PORT; // No type safety, no validation
  }
}
```

**Adding new environment variables:**

1. Add property to `EnvSchema` class in `env.schema.ts` with validation decorators
2. Use `@Transform()` for type conversion (e.g., string to number)
3. Use `@IsOptional()` for optional variables
4. Access via `envService.get('VARIABLE_NAME')` - autocomplete will work

**Example:**

```typescript
// In env.schema.ts
export class EnvSchema {
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  NEW_PORT: number = 8080;

  @IsString()
  @IsOptional()
  NEW_API_KEY?: string;
}

// In your service
const port = this.envService.get("NEW_PORT"); // number
const apiKey = this.envService.get("NEW_API_KEY"); // string | undefined
```

**Validation:**

- All environment variables are validated on application startup
- Invalid values throw errors before the app starts
- Type conversion happens automatically via `@Transform()` decorators

### Feature-Based Organization (Frontend)

**Structure rules:**

- Complex business logic organized in `features/` directory
- Each feature has: components, hooks, lib, stores, types
- Routes in `app/` import from `features/`
- Shared code goes to root-level directories

**Feature module structure:**

```
features/
├── auth/
│   ├── components/
│   │   ├── LoginForm.tsx
│   │   └── RegisterForm.tsx
│   ├── hooks/
│   │   ├── useLogin.ts
│   │   └── useRegister.ts
│   ├── stores/
│   │   └── authStore.ts          # Feature-specific store if needed
│   ├── types/
│   │   └── auth.types.ts
│   └── index.ts                   # Export barrel
│
├── conversations/
│   ├── components/
│   │   ├── ConversationList.tsx
│   │   ├── ConversationItem.tsx
│   │   ├── MessageList.tsx
│   │   └── MessageInput.tsx
│   ├── hooks/
│   │   ├── useConversations.ts
│   │   ├── useMessages.ts
│   │   └── useSendMessage.ts
│   ├── lib/
│   │   └── messageUtils.ts
│   ├── stores/
│   │   └── conversationStore.ts
│   ├── types/
│   │   └── conversation.types.ts
│   └── index.ts
│
└── platform-connections/
    ├── components/
    │   ├── PlatformConnectionCard.tsx
    │   └── OAuthButton.tsx
    ├── hooks/
    │   └── usePlatformConnections.ts
    └── index.ts
```

**App routes import from features:**

```
app/(dashboard)/conversations/
├── page.tsx                    # Imports from features/conversations
└── [id]/
    └── page.tsx                # Imports from features/conversations

app/(auth)/login/
└── page.tsx                    # Imports from features/auth
```

**Shared resources (root level):**

```
components/                     # Shared UI components
├── common/
│   ├── LoadingSpinner.tsx
│   └── ErrorBoundary.tsx
└── layout/
    ├── Sidebar.tsx
    └── Header.tsx

hooks/                          # Shared hooks
├── useWebSocket.ts
└── useAuth.ts                  # Wraps features/auth

lib/                            # Shared infrastructure
├── api/
│   └── client.ts              # Axios instance
├── websocket/
│   └── client.ts              # WebSocket singleton
└── stores/                     # Global cross-feature stores
    └── uiStore.ts             # Global UI state

types/                          # Shared TypeScript types
└── api.types.ts
```

**Decision tree:**

- ✅ **In `features/`**: Business logic for a specific domain (auth, conversations, settings)
- ✅ **In root `components/`**: Pure UI components used across features (buttons, layouts)
- ✅ **In root `lib/`**: Infrastructure (API client, WebSocket, utilities)
- ✅ **In root `hooks/`**: Infrastructure hooks or wrappers around feature hooks
- ✅ **In root `stores/`**: Global state shared across multiple features

## Critical Implementation Details

### Authentication Flow

1. **Login**: POST `/api/auth/login` → returns `{ accessToken, refreshToken, user }`
2. **Token refresh**: Frontend axios interceptor catches 401, calls `/api/auth/refresh` with refreshToken
3. **WebSocket auth**: Socket.IO auth middleware validates JWT from `auth: { token }` in connection handshake

### Frontend API Client

`lib/api/client.ts` has two interceptors:

- **Request**: Adds `Authorization: Bearer {token}` from `useAuthStore`
- **Response**: On 401, attempts refresh token flow once (using `originalRequest._retry` flag)

### WebSocket Integration

**Backend**:

- Socket.IO gateway with Redis adapter for horizontal scaling
- Room strategy: `user:{userId}` (all events sent to user-specific rooms)
- Kafka consumer bridges `websocket.notifications` topic to Socket.IO emits

**Frontend**:

- `wsClient.connect()` on app init (after auth)
- Listeners update Zustand stores directly (optimistic updates)
- `joinConversation(id)` / `leaveConversation(id)` for room management
- Typing indicators use debounced `sendTypingStart` / `sendTypingStop`

### Kafka Topics (Planned)

- `platform.webhooks.raw`: Raw webhook payloads (partition by `platform + accountId`)
- `messages.incoming`: Normalized inbound messages (partition by `conversationId`)
- `messages.outgoing`: Messages to send to platforms (partition by `conversationId`)
- `messages.status`: Delivery receipts, read status (partition by `messageId`)
- `websocket.notifications`: Real-time events for frontend (partition by `userId`)

Partitioning by `conversationId` ensures message ordering within conversations.

## Development Workflow

### Adding a New Platform Integration

The platform architecture uses the **Adapter Pattern** for easy extensibility:

**Step 1: Create Platform Adapter** (`backend/src/modules/platforms/adapters/{platform}.adapter.ts`)

```typescript
@Injectable()
export class NewPlatformAdapter extends BasePlatformAdapter {
  readonly platform = Platform.NEW_PLATFORM;

  verifySignature(rawBody: string, signature: string, secret: string): boolean {
    /* ... */
  }
  extractAccountId(payload: unknown): string {
    /* ... */
  }
  extractEvents(payload: unknown): PlatformEvent[] {
    /* ... */
  }
  normalizeMessage(event: MessageEvent): NormalizedMessage {
    /* ... */
  }
  getConversationKey(senderId: string, recipientId: string): string {
    /* ... */
  }
  formatOutbound(message: OutboundMessage): PlatformPayload {
    /* ... */
  }
  send(connection, recipientId, payload): Promise<SendResult> {
    /* ... */
  }
  fetchUserProfile(connection, userId): Promise<UserProfile> {
    /* ... */
  }
}
```

**Step 2: Register Adapter** (`backend/src/modules/platforms/adapters/adapters.module.ts`)

```typescript
// Add to providers and constructor
this.platformRegistry.register(this.newPlatformAdapter);
```

**Step 3: Create Platform Module** (`backend/src/modules/platforms/{platform}/`)

- `{platform}.controller.ts`: HTTP endpoints (webhook, OAuth)
- `{platform}.service.ts`: Platform-specific OAuth logic
- `{platform}.consumer.ts`: Kafka consumer (calls WebhookProcessorService)
- `dto/`: Request/response validation

**Step 4: Add Environment Variables** (`backend/src/common/env/env.schema.ts`)

```typescript
@IsString() @IsOptional() NEW_PLATFORM_APP_ID?: string;
@IsString() @IsOptional() NEW_PLATFORM_APP_SECRET?: string;
```

**Step 5: Update Constants** (`backend/src/common/constants/platforms.constant.ts`)

```typescript
export enum Platform { ..., NEW_PLATFORM = 'new_platform' }
```

**Architecture Overview:**

```
modules/platforms/
├── core/                     # Shared infrastructure (DO NOT MODIFY)
│   ├── interfaces/           # IPlatformAdapter, types
│   └── services/             # PlatformRegistry, WebhookProcessorService
├── adapters/                 # Platform-specific implementations
│   ├── facebook.adapter.ts
│   ├── zalo.adapter.ts
│   ├── shopee.adapter.ts
│   ├── tiktok.adapter.ts
│   └── {new}.adapter.ts      # ADD NEW ADAPTER HERE
└── {platform}/               # Platform modules (HTTP, OAuth, Kafka)
```

### Adding WebSocket Events

1. Define event in `backend/src/modules/websocket/websocket.gateway.ts`
2. Add emit method: `emitEventName(userId: string, data: any)` using `emitToUser` helper
3. Call emit method from services/consumers with userId parameter
4. Update frontend `lib/websocket/client.ts` with listener
5. Update Zustand store to handle event data

**Important**: All WebSocket events must be sent to user-specific rooms using `emitToUser(userId, event, data)` pattern.

### Environment Setup

**Required for development:**

1. Copy `.env.example` → `.env` (backend)
2. Copy `.env.local.example` → `.env.local` (frontend)
3. Set JWT secrets (generate with `openssl rand -base64 32`)
4. Configure platform credentials (FB_APP_ID, ZALO_APP_ID, etc.)
5. Start Docker services before running apps

## Technology Constraints

### Frontend (MUI) - STRICT RULES

- **Only use built-in MUI components** - no custom component creation
- **No custom theme** - use default MUI theme from `lib/theme.ts` as-is
- **No custom styling:**
  - ❌ Do NOT add custom borders, shadows, colors, spacing beyond MUI defaults
  - ❌ Do NOT use `sx` prop to override component styles
  - ❌ Do NOT use `styled()` from `@emotion/styled` to create custom styled components
  - ❌ Do NOT use custom CSS files or inline styles
  - ✅ ONLY use MUI component props (variant, color, size, etc.)
  - ✅ ONLY use MUI's built-in theme values via component props
- Use `@mui/material-nextjs` for Next.js 16 App Router integration
- **Example of correct usage:**

  ```tsx
  // ✅ CORRECT - Using only MUI components with their props
  <Button variant="contained" color="primary" size="large">
    Submit
  </Button>
  <Card>
    <CardContent>
      <Typography variant="h5">Title</Typography>
    </CardContent>
  </Card>

  // ❌ WRONG - Custom styling
  <Button sx={{ borderRadius: 8, boxShadow: 3 }}>Submit</Button>
  <div style={{ border: '1px solid red' }}>Content</div>
  const CustomCard = styled(Card)`border: 2px solid blue;`;
  ```

### Package Management

- **Use Yarn** for both backend and frontend (not npm)
- Next.js version is `15.0.0-rc.1` (RC, not stable) - expecting v16 but using latest RC
- React 19 installed (peer dependency warnings expected)

### API Architecture

- **Next.js does NOT handle API routes** - all APIs are in NestJS backend
- Frontend calls backend API at `http://localhost:3000/api` (configured in `.env.local`)
- No `app/api/` directory in Next.js - only pages/routes for UI
- All business logic, database access, webhooks handled by backend

### TypeScript Configuration

- Backend uses path alias `@/*` for `src/*`
- Frontend uses `@/*` for root directory
- Strict mode disabled in both projects for faster development

## Onboarding Flow

New users follow a three-step onboarding process after authentication:

**Route Structure:**

- `(onboarding)` layout group: `/create-organization`, `/connect-platforms`, `/invite-members`
- Shared layout: Header with branding, centered content container
- `OnboardingGuard` component enforces flow: authenticated users without organization are redirected to onboarding

**Steps:**

1. **Create Organization** (`create-organization/page.tsx`)

   - Hook: `useCreateOrganization()`
   - Component: `CreateOrganizationForm` (name, slug, description)
   - POST `/api/organizations` → sets organizationId in authStore

2. **Connect Platforms** (`connect-platforms/page.tsx`)

   - Component: `ConnectPlatformsStep`
   - Shows available platforms (Facebook, Zalo, TikTok, Shopee)
   - Optional step - can skip to next

3. **Invite Members** (`invite-members/page.tsx`)
   - Hook: `useInviteMembers()`
   - Component: `InviteMembersStep` (email, role: admin/agent/viewer)
   - POST `/api/organizations/{id}/members` → batch invite members

**Progress Tracking:**

- Hook: `useOnboardingProgress()` tracks current step
- Component: `OnboardingProgress` displays step indicator
- authStore integration for organizationId persistence

**Types:** See `features/onboarding/types/onboarding.types.ts` - OnboardingStep, CreateOrganizationRequest, InviteMemberRequest

## Current Development Phase

**Phase 1 (Complete):** Foundation setup + Onboarding

- NestJS modules scaffold
- MongoDB schemas
- JWT authentication
- Next.js 16 with MUI + Zustand + TanStack Query
- Docker Compose infrastructure
- Onboarding flow (create organization, connect platforms, invite members)

**Phase 2 (Next):** WebSocket Infrastructure

- Socket.IO Gateway implementation
- Redis adapter for scaling
- Kafka → WebSocket bridge
- Frontend WebSocket integration

**Phase 3:** Core Messaging

- Kafka topics and consumers
- Message normalization service
- REST APIs for conversations/messages
- Frontend conversation list and message components

See README.md for complete roadmap.
