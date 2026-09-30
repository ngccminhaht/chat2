# Project Engineering Guide

This guide reflects the checked-in implementation. Some repository docs describe earlier designs; when they disagree with code, follow the active wiring and mark unresolved behavior for verification.

## 1. Project Overview

Omnichannel customer messaging application. The dashboard manages organizations, connected channels, conversations, messages, customers, quick replies, and widget settings. Backend integrations receive platform webhooks and send replies to connected platforms. A separately built browser widget provides organization-specific web chat.

## 2. Tech Stack

- Backend: Node.js, TypeScript, NestJS 10, Mongoose 8 / MongoDB, Socket.IO, KafkaJS/Nest Kafka microservice, Redis, BullMQ, AWS S3 SDK-compatible media storage.
- Dashboard: Next.js App Router, React 19, TypeScript, MUI 7, TanStack Query, Zustand, Axios, next-intl, Keycloak JS.
- Embeddable widget: Preact, TypeScript, Vite library build, Tailwind CSS, Socket.IO client. Build output is written into `frontend/public`.
- Tests: Jest and ts-jest in backend; unit, integration, and e2e tests exist. No frontend test runner is configured in its package scripts.
- Repository has independent backend, frontend, and widget package manifests; no root package manifest or checked-in root lockfile was found. Do not assume a monorepo task runner or a single install command.

## 3. Repository Structure

```text
backend/
  src/main.ts                 Nest bootstrap, API prefix, global pipes, Kafka transport
  src/app.module.ts           Infra, auth guards, and feature module composition
  src/common/                 Env validation, Mongoose schemas, guards, decorators, constants
  src/infra/                  Kafka producer/consumers and Redis integration
  src/modules/                HTTP/API and business modules
  test/                       E2E tests and config; src/test has integration tests/helpers
frontend/
  app/                        Next App Router pages and layouts
  features/                   Dashboard feature UI, hooks, types, and stores
  components/                 Shared layout, guards, and common components
  lib/                        Axios API client, Keycloak, theme, WebSocket, constants
  messages/, i18n/             English/Vietnamese translations and next-intl setup
widget/
  src/                        Preact embed entry, API/socket clients, widget components
docs/                          Architecture and integration notes; check claims against code
scripts/                       Repository utility scripts
docker-compose.yml             Local infrastructure plus backend/frontend app services
```

Place backend domain behavior in the relevant Nest module; shared database/auth/infrastructure concerns belong under `backend/src/common` or `backend/src/infra`. Keep dashboard-specific code in its existing feature folder; use `frontend/components` for genuinely shared UI. Keep embeddable widget behavior in `widget/src`, not in dashboard feature components.

## 4. System Architecture

This is a multi-package application with a modular NestJS backend, Next.js dashboard, and independently bundled Preact widget. It is not a set of deployed microservices in this repository. Nest feature modules are composed in `backend/src/app.module.ts`.

Platform integration code has an adapter/registry structure (`backend/src/modules/platforms/adapters`, `core/interfaces`, `core/services`). Platform-specific controllers/services/consumers coexist with the shared adapter processor. Some other message paths call services directly; do not assume every operation follows the documented Kafka-only design.

## 5. Application Data Flow

- Dashboard queries use TanStack Query hooks and the shared Axios client. Organization context is read from the Zustand auth store and included in organization-scoped API paths.
- Platform inbound: platform controller validates/receives a webhook and publishes it to the platform Kafka topic; a platform consumer invokes `WebhookProcessorService`; the processor resolves the connection and adapter, normalizes events, and delegates inbound persistence to `InboundMessageHandlerService`. Notifications are published to Kafka and forwarded by `WebSocketBridgeConsumer` to the authenticated Socket.IO gateway.
- Outbound dashboard messaging: organization-scoped messages controller/service validates access/data, persists/sends through the selected platform path and publishes notifications as implemented. `MessageSenderService` also exists as shared adapter-driven send logic; inspect callers before changing outbound behavior.
- Widget: `widget/src/index.tsx` reads `data-org` and optional `data-api`, renders the Preact app, fetches public config, then connects to the `/visitor` Socket.IO namespace. `VisitorGateway` and `VisitorMessageService` handle visitor messages and restoration.

## 6. Frontend Architecture

- App Router pages live in `frontend/app`; organization dashboard routes are under `app/(dashboard)/organizations/[slug]/...`. Root providers are composed in `app/providers.tsx`.
- Most interactive UI is client-side (feature components/hooks); do not assume server components are used for data access. Inspect each route/component before extending it.
- Dashboard features include auth, organizations, onboarding, conversations, customers, connections, quick replies, and settings. Feature folders own their hooks/types/components; cross-feature reuse should use existing shared components and API client.
- Alias `@/*` resolves to `frontend/*`. Backend alias `@/*` resolves to `backend/src/*`.
- Dashboard API URL defaults to `http://localhost:3000/api`; WebSocket URL defaults to `http://localhost:3000`. Actual frontend dev/start port in `frontend/package.json` is 8315.

## 7. Backend Architecture and API

- Bootstrap: `backend/src/main.ts`; global prefix is `/api`, cookie parser and permissive credentialed CORS are enabled, and a global transforming `ValidationPipe` is configured with whitelist disabled.
- Feature modules are registered by `AppModule`. Controllers generally use Nest decorators and DTOs; services contain most query/business behavior. Mongoose schemas are in `backend/src/common/database/schemas`.
- Important modules: `auth`, `users`, `organizations`, `conversations`, `messages`, `customers`, `connections`, `platforms`, `webhooks`, `websocket`, `widget`, `quick-replies`, `media`, `external-api`, `ai-batching`.
- API paths are mainly declared in module controllers. Common paths include `/api/organizations/:organizationId/conversations`, `/messages`, `/connections`, `/customers`, `/quick-replies`, and platform callbacks/webhooks such as `/api/facebook/...`, `/api/zalo/...`, `/api/shopee/...`, `/api/telegram/...`. Verify exact route decorators before relying on a path.
- DTOs use `class-validator`/`class-transformer` in many modules, but validation is not strict globally. Preserve the existing response shape unless a task calls for a contract change.

## 8. Database Architecture

MongoDB with Mongoose; there is no checked-in migration framework or migration directory. Schema definitions are the source of truth at `backend/src/common/database/schemas` (with quick replies also defined in its feature module).

Core records: `Organization` owns members, platform connections, conversations, customers, and widget settings; `OrganizationMember` stores org membership/role; `Conversation` stores channel/customer identity, status, tags, last-message summary and AI state; `Message` belongs to organization and conversation and stores direction/type/content/status; `PlatformConnection` stores platform account and credentials; `Customer` and `ConversationNote` support CRM and notes.

Conversation and message schemas state that tenant-scoped reads must include `organizationId`; retain that filter when adding queries. Check indexes and uniqueness constraints in the schema before changing identity/deduplication behavior. There is no relational ORM or SQL schema.

## 9. Authentication, Authorization, and Tenant Boundaries

- `AppModule` installs global `nest-keycloak-connect` `AuthGuard` and `RoleGuard`, with `KeycloakUserSyncGuard` between them to synchronize authenticated Keycloak users into MongoDB. Keycloak config is in `backend/src/common/keycloak`.
- Frontend initializes Keycloak in `frontend/lib/keycloak`; the shared Axios request interceptor adds its bearer token. Auth provider and onboarding/org guards are composed in `frontend/app/providers.tsx`.
- A separate local JWT auth module, JWT strategy/guard, and `TenantGuard` remain in the source. Do not assume these are the active global HTTP auth flow; determine route-level usage before changing authentication.
- Organization IDs appear in API route parameters and are used in many service query filters. Membership/role enforcement is distributed and needs verification per endpoint. Never trust an organization ID supplied by a client without verifying membership and tenant-scoped resource access.
- The visitor widget uses a public organization slug and unauthenticated visitor namespace; review origin, rate-limit, and organization scoping when modifying it.

## 10. State Management and Shared UI

- TanStack Query is the dashboard server/cache state layer, configured in `frontend/app/providers.tsx`; feature hooks in `frontend/features/*/hooks` own query/mutation calls and keys.
- Zustand stores are used for client/session selections, including `frontend/features/auth/stores/authStore.ts` and `frontend/features/conversations/stores/conversationStore.ts`. Keep ephemeral component state local; do not duplicate server cache data into Zustand without a clear existing pattern.
- Socket.IO client context/listeners live in `frontend/lib/websocket`; websocket events can affect conversation/message views and must be considered alongside query cache updates.
- MUI is the dashboard component system. Theme source is `frontend/lib/theme.ts`; global CSS is `frontend/app/globals.css`. Reuse MUI and existing shared/layout components rather than creating duplicate controls. Widget has its own Tailwind styling and must not import dashboard MUI components.
- Translation messages are under `frontend/messages` with locale selection in `frontend/i18n`.

## 11. Business Domains and Dependencies

- Organization/membership provides tenant context to connections, inbox, customers, widget, and settings.
- Platform connection/OAuth maps a connected account to an organization; platform adapters normalize external events into conversation/message records.
- Conversations group customer messages and drive inbox views, assignment/status/notes, and real-time updates.
- Messages depend on conversation, organization, platform connection, and platform adapter; changes may affect persistence, deduplication, sending, Kafka events, and dashboard/widget clients.
- Customers link visitor/platform identities to organization conversations.
- Quick replies are organization-level templates exposed in dashboard composer.
- AI batching queues/combines messages and integrates with a configurable external AI endpoint; inspect its module/config/docs before changing retry or message timing behavior.

## 12. External Integrations, Events, and Realtime

- Social commerce/chat platforms: Facebook, Zalo, Shopee, Telegram are currently imported by `PlatformsModule`; TikTok adapter/topic/config code exists, but the active module wiring does not import a TikTok platform module. Treat TikTok end-to-end support as Needs verification.
- Infrastructure: MongoDB/Mongoose, Kafka, Redis, BullMQ; object storage via AWS S3 SDK in `media`. Keycloak provides dashboard/backend authentication.
- Kafka topic names and connection config: `backend/src/infra/kafka/kafka.config.ts`; producers/consumers live under `backend/src/infra/kafka` and platform modules. Avoid changing payload/topic contracts without tracing consumers.
- Authenticated dashboard socket gateway is `backend/src/modules/websocket/websocket.gateway.ts`; visitor widget socket is the `/visitor` namespace in `visitor.gateway.ts`. The Kafka bridge is `websocket-bridge.consumer.ts`; dashboard socket context/listeners are in `frontend/lib/websocket`.
- `docker-compose.yml` builds and runs backend/frontend plus MongoDB, Kafka, Redis, and MinIO. Copy `docker.env.example` to root `.env` and configure credentials/Keycloak before `docker compose build` / `docker compose up -d`.

## 13. Environment Configuration

Never copy secret values into docs, logs, or commits. Backend config is validated through `backend/src/common/env/env.schema.ts` and accessed via `EnvService`; `backend/.env.example` is not fully aligned with that schema or current code. Frontend public config is read in `frontend/next.config.js` and `frontend/lib/keycloak`.

| Variable(s) | Purpose / usage |
|---|---|
| `NODE_ENV`, `PORT`, `FRONTEND_URL`, `API_BASE_URL`, `CORS_ORIGINS` | Backend runtime, callback/base URLs, CORS; see `EnvSchema` and bootstrap/gateway. |
| `MONGODB_URI` | Mongoose connection. |
| `REDIS_URL`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB` | Redis adapter/rate limiting and BullMQ connection. |
| `KAFKA_BROKERS`, `KAFKA_CLIENT_ID` | Kafka transport/producer. |
| `KEYCLOAK_REALM`, `KEYCLOAK_SERVER_URL`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET` | Backend Keycloak integration. |
| `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | Retained local JWT module. |
| `FACEBOOK_*`, `ZALO_*`, `SHOPEE_*`, `TIKTOK_*` | Platform OAuth/webhook settings as declared in EnvSchema; check exact code usage. |
| `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_PUBLIC_URL` | Media object storage. |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_KEYCLOAK_URL`, `NEXT_PUBLIC_KEYCLOAK_REALM`, `NEXT_PUBLIC_KEYCLOAK_CLIENT_ID` | Dashboard API/socket and browser Keycloak configuration. |
| `MONGO_PASSWORD`, MinIO root vars, `REDIS_PASSWORD` | Compose infrastructure credentials; provide via environment, never document values. |

Needs verification: `.env.example` includes legacy/unmodeled names (including MinIO and TikTok variants) and the schema has defaults that do not match all compose/example ports. Confirm schema, runtime consumers, and deployment environment together when changing configuration.

## 14. Errors, Logging, Testing, and Commands

- Nest exceptions and logger are used; there is no evidence of a single custom global exception/response formatter. Frontend Axios rejects errors; feature UI decides how to surface them.
- Backend logging uses Nest `Logger` and some direct console output. A confirmed sensitive-data risk is verbose Facebook webhook logging of full payloads (controller and consumer); avoid adding payload/token/PII logging and treat existing logs carefully. No Sentry/OpenTelemetry setup was found.
- Backend unit tests are `*.spec.ts` under `backend/src`; integration tests are under `backend/src/test/integration`; e2e tests/config are under `backend/test`.
- From each package directory, use commands declared in its `package.json`:
  - Backend: `npm run dev`, `npm run build`, `npm test`, `npm run test:e2e`, `npm run test:cov`; `npm run lint` invokes ESLint with `--fix`, so inspect its effect before using it.
  - Frontend: `npm run dev`, `npm run build`, `npm start`, `npm run type-check`, `npm run lint` (script is `next lint`; verify compatibility with installed Next version).
  - Widget: `npm run build` (build CSS then Vite output into `frontend/public`), `npm run watch`.
- Local infra: `docker compose up -d` from repository root. README setup instructions and ports are stale in places; use package scripts and compose/config as source of truth.

## 15. Critical Files and Security-Sensitive Areas

- `backend/src/main.ts`, `backend/src/app.module.ts`: process bootstrap, global middleware/pipes, auth and module composition.
- `backend/src/common/env/env.schema.ts`: accepted/default backend configuration.
- `backend/src/common/database/schemas/*`: persistence contract, indexes, tenancy and dedup constraints.
- `backend/src/modules/platforms/core/services/*`, `backend/src/modules/platforms/adapters/*`: platform normalization/dispatch.
- `backend/src/modules/messages/*`, `backend/src/infra/kafka/*`: message persistence/sending/event contracts.
- `backend/src/modules/websocket/*`, `frontend/lib/websocket/*`: realtime and visitor boundaries.
- `frontend/app/providers.tsx`, `frontend/lib/api/client.ts`, `frontend/lib/keycloak/*`: application-wide auth/query/API behavior.
- `frontend/lib/theme.ts`, `frontend/app/globals.css`: dashboard visual source of truth.
- `widget/src/index.tsx`, `widget/vite.config.ts`: public embed contract and generated output destination.

Security-sensitive: Keycloak/JWT handling, organization membership and tenant filters, platform OAuth credentials, webhook signature checks, public visitor sockets, upload/media URLs, and API-key auth. Never log passwords, tokens, cookies, secrets, or raw personal webhook data. Inspect real route/guard/service behavior before changing access control.

## 16. Known Technical Debt / Risks

- Confirmed: `backend/.env.example`, `EnvSchema`, compose ports/defaults, and README setup are inconsistent. Treat environment behavior as Needs verification before deployment/config changes.
- Confirmed: environment/config source files include fallback credential values, and Compose initializes the MinIO bucket for anonymous public access. These are local defaults, but deployment safety and media exposure need human review; never copy the values into documentation.
- Confirmed: local JWT auth artifacts coexist with globally configured Keycloak auth. Determine which path is used by the target endpoint before modifying auth.
- Confirmed: Facebook webhook controller/consumer log raw event payload data. Avoid reproducing this pattern; review log retention/redaction separately.
- Confirmed: the authenticated WebSocket gateway joins conversation/org rooms based on client events; room-join handlers should be reviewed for membership/resource authorization before changing realtime access.
- Confirmed: visitor gateway currently allows any Origin (with an in-code TODO to validate allowed origins); review cross-site socket abuse and rate limiting when changing the widget boundary.
- Needs verification: root docs (`README.md`, `CLAUDE.md`, several `docs/*`) describe earlier routes, ports, models, and Kafka flows. Verify every operational claim against active source.
- Needs verification: TikTok has adapter/config/topic artifacts but is not included in `PlatformsModule` wiring.

## 17. Architecture Decision Notes

- The code uses MongoDB/Mongoose, Kafka for webhook/event processing, Socket.IO for realtime, and modular Nest feature modules. Rationale is described in `docs/system-architecture.md` and `README.md`, but those documents contain stale implementation details; verify before treating their explanations as current decisions.
- No formal ADR directory or migration history was found.

## 18. Agent Development Rules

Before changing code:

1. Identify the owning package and feature module; inspect its controller, service, schema/DTO, callers, and tests.
2. Search for an existing component, hook, API client, adapter, event type, or schema before creating another one.
3. Trace tenant ID and authorization checks from route/socket input through service and database query.
4. Trace Kafka/socket payload consumers when changing message or event contracts.
5. Check actual package scripts/config rather than copying README commands.

During changes, preserve established module boundaries and response/event contracts, reuse shared UI/API infrastructure, avoid duplicate business logic, and never weaken auth, tenant isolation, webhook verification, or secret handling to make a flow work.

After changes, run the narrow relevant type-check/test/build where available and report commands/results. Do not use backend lint blindly because it auto-fixes files.

## 19. Quick Navigation

| Need to change | Look here first |
|---|---|
| Backend bootstrap/module wiring | `backend/src/main.ts`, `backend/src/app.module.ts` |
| Authentication | `backend/src/common/keycloak`, `backend/src/modules/auth`, `frontend/lib/keycloak` |
| Tenant/schema | `backend/src/common/database/schemas`, organization/conversation services |
| API endpoint | Controller and DTO in `backend/src/modules/<feature>` |
| Conversation/message flow | `backend/src/modules/conversations`, `messages`, `platforms/core` |
| Platform/OAuth/webhook | `backend/src/modules/platforms/<platform>`, `platforms/adapters`, `webhooks` |
| Kafka/realtime | `backend/src/infra/kafka`, `backend/src/modules/websocket`, `frontend/lib/websocket` |
| Dashboard feature UI | `frontend/features/<feature>`, route in `frontend/app` |
| Shared dashboard UI/theme | `frontend/components`, `frontend/lib/theme.ts`, `frontend/app/globals.css` |
| Widget | `widget/src`, output in `frontend/public` |
| Environment | `backend/src/common/env/env.schema.ts`, `backend/.env.example`, `docker.env.example`, `frontend/next.config.js`, `docker-compose.yml` |
| Tests | `backend/src/**/*.spec.ts`, `backend/src/test`, `backend/test` |
