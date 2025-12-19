# Message Flow Architecture

Tài liệu mô tả chi tiết luồng gửi/nhận tin nhắn trong hệ thống MiAgent.

## Overview

Hệ thống sử dụng Kafka làm message broker để xử lý async và WebSocket để real-time notification.

## Kafka Topics

| Topic | Partition Key | Purpose |
|-------|---------------|---------|
| `platform.facebook.webhooks` | `facebook:{pageId}` | Facebook webhooks |
| `platform.zalo.webhooks` | `zalo:{oaId}` | Zalo webhooks |
| `platform.tiktok.webhooks` | `tiktok:{shopId}` | TikTok webhooks |
| `platform.shopee.webhooks` | `shopee:{shopId}` | Shopee webhooks |
| `messages.outgoing` | `conversationId` | Outbound messages |
| `websocket.notifications` | `userId` | Real-time notifications |

---

## Inbound Message Flow (Platform → Dashboard)

Luồng tin nhắn từ các platform (Facebook, Zalo, TikTok, Shopee) đến Dashboard.

```mermaid
sequenceDiagram
    autonumber
    participant P as Platform (FB/Zalo/etc)
    participant W as Webhook Controller
    participant K as Kafka
    participant C as Platform Consumer
    participant WP as WebhookProcessor
    participant DB as MongoDB
    participant KN as Kafka Notifications
    participant WB as WS Bridge Consumer
    participant WS as WebSocket Gateway
    participant D as Dashboard

    P->>W: POST /api/{platform}/webhook
    W->>W: Verify signature
    W->>K: Publish to platform.{x}.webhooks
    W-->>P: 200 OK (immediate)

    K->>C: Consume webhook event
    C->>WP: processWebhook(payload)
    WP->>WP: Extract events (message, delivery, read)
    WP->>WP: Normalize via PlatformAdapter
    WP->>DB: Save Message
    WP->>DB: Update Conversation.lastMessage
    WP->>KN: Publish to websocket.notifications

    KN->>WB: Consume notification
    WB->>WS: emitNewMessage(userId, {conversationId, message})
    WS->>D: emit('message:new')
    WS->>D: emit('conversation:updated')
```

### Flow Description

1. **Webhook Reception**: Platform gửi webhook đến HTTP endpoint
2. **Signature Verification**: Verify HMAC signature để đảm bảo authenticity
3. **Kafka Publish**: Publish raw payload đến Kafka, return 200 ngay lập tức
4. **Async Processing**: Consumer xử lý webhook từ Kafka
5. **Normalization**: PlatformAdapter normalize message sang format thống nhất
6. **Database Save**: Lưu Message và update Conversation
7. **Notification**: Publish đến websocket.notifications topic
8. **WebSocket Bridge**: Bridge consumer emit đến WebSocket Gateway
9. **Real-time Update**: Dashboard nhận event qua WebSocket

---

## Inbound Message Flow (Widget → Dashboard)

Luồng tin nhắn từ Widget (web chat) đến Dashboard.

```mermaid
sequenceDiagram
    autonumber
    participant V as Widget (Visitor)
    participant VG as VisitorGateway
    participant VMS as VisitorMessageService
    participant DB as MongoDB
    participant WS as WebSocket Gateway
    participant D as Dashboard

    V->>VG: emit('message:send', {text})
    VG->>VG: Rate limit check
    VG->>VMS: processVisitorMessage()
    VMS->>DB: Get/Create Conversation
    VMS->>DB: Save Message (INBOUND)
    VMS->>DB: Update lastMessage, unreadCount
    VMS->>WS: emitToOrgAgents('message:new')
    VMS->>WS: emitToOrgAgents('conversation:updated')
    WS->>D: emit to org:{orgId}:agents room
    VG-->>V: emit('message:sent', {messageId})
```

### Flow Description

1. **Widget Send**: Visitor emit message qua WebSocket
2. **Rate Limit**: Check spam protection
3. **Process**: VisitorMessageService xử lý message
4. **Database**: Lưu message và update conversation
5. **Broadcast**: Emit đến tất cả agents trong org
6. **Confirmation**: Gửi confirmation về widget

---

## Outbound Message Flow (Dashboard → Platform)

Luồng tin nhắn từ Dashboard đến các platform.

```mermaid
sequenceDiagram
    autonumber
    participant D as Dashboard
    participant API as Messages API
    participant MS as MessagesService
    participant DB as MongoDB
    participant K as Kafka
    participant MSC as MessageSenderConsumer
    participant PA as PlatformAdapter
    participant P as Platform API
    participant KN as Kafka Notifications
    participant WB as WS Bridge Consumer
    participant WS as WebSocket Gateway

    D->>API: POST /messages/send
    API->>MS: send(dto)
    MS->>DB: Create Message (PENDING)
    MS->>K: Publish to messages.outgoing
    MS-->>D: Return pending message

    K->>MSC: Consume outgoing message
    MSC->>PA: Get adapter for platform
    MSC->>PA: formatOutbound(message)
    MSC->>P: Send via platform API
    P-->>MSC: Response (success/error)
    MSC->>DB: Update status (SENT/FAILED)
    MSC->>KN: Publish status notification

    KN->>WB: Consume notification
    WB->>WS: emitMessageStatus()
    WS->>D: emit('message:status')
```

### Flow Description

1. **API Call**: Dashboard gửi request tạo message
2. **Create Pending**: Tạo message với status PENDING
3. **Kafka Publish**: Publish đến messages.outgoing topic
4. **Optimistic Return**: Return message ngay cho UI
5. **Async Send**: Consumer gửi message qua platform API
6. **Status Update**: Update status sau khi gửi
7. **Notification**: Emit status change đến Dashboard

---

## Outbound Message Flow (Dashboard → Widget)

Luồng tin nhắn từ Dashboard (Agent) đến Widget (Visitor).

```mermaid
sequenceDiagram
    autonumber
    participant D as Dashboard
    participant API as Messages API
    participant MS as MessagesService
    participant VMS as VisitorMessageService
    participant DB as MongoDB
    participant VG as VisitorGateway
    participant V as Widget
    participant WS as WebSocket Gateway

    D->>API: POST /messages/send (web platform)
    API->>MS: send(dto)
    MS->>MS: Check platform === WEB
    MS->>VMS: sendToVisitor()
    VMS->>DB: Create Message (SENT)
    VMS->>DB: Update Conversation
    VMS->>VG: emitToVisitor(sessionId, 'message:received')
    VG->>V: emit to visitor:{sessionId} room
    VMS->>WS: emitToOrgAgents('message:new')
    VMS->>WS: emitToOrgAgents('conversation:updated')
    WS->>D: emit to org agents (sync other agents)
```

### Alternative Path (via Kafka):

```mermaid
sequenceDiagram
    autonumber
    participant D as Dashboard
    participant K as Kafka
    participant MSC as MessageSenderConsumer
    participant DB as MongoDB
    participant VG as VisitorGateway
    participant V as Widget
    participant WS as WebSocket Gateway

    Note over D,K: Message already published to messages.outgoing

    K->>MSC: Consume (platform=WEB)
    MSC->>MSC: handleWebPlatformMessage()
    MSC->>DB: Get message details
    MSC->>VG: emitToVisitor('message:received')
    VG->>V: emit to visitor:{sessionId}
    MSC->>DB: Update status to SENT
    MSC->>WS: emitToOrgAgents('message:new')
    MSC->>WS: emitToOrgAgents('conversation:updated')
    WS->>D: Broadcast to all org agents
```

---

## WebSocket Rooms Structure

```mermaid
graph TB
    subgraph "Dashboard Connections"
        U1[User 1] --> UR1[user:userId1]
        U2[User 2] --> UR2[user:userId2]
        U1 --> OA[org:orgId:agents]
        U2 --> OA
        U1 --> C1[conversation:convId1]
    end

    subgraph "Widget Connections"
        V1[Visitor 1] --> VR1[visitor:sessionId1]
        V2[Visitor 2] --> VR2[visitor:sessionId2]
        V1 --> OV[org:orgId:visitors]
        V2 --> OV
    end
```

### Room Types

| Room Pattern | Purpose | Namespace |
|--------------|---------|-----------|
| `user:{userId}` | User-specific notifications | default (/) |
| `org:{orgId}:agents` | Broadcast to all org agents | default (/) |
| `conversation:{convId}` | Conversation-specific events | default (/) |
| `visitor:{sessionId}` | Visitor-specific messages | /visitor |
| `org:{orgId}:visitors` | Broadcast to all org visitors | /visitor |

---

## Event Types

### Dashboard Events (default namespace)

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `message:new` | Server→Client | `{conversationId, message}` | New message received |
| `message:status` | Server→Client | `{conversationId, messageId, status}` | Message status change |
| `conversation:updated` | Server→Client | `{conversationId, ...}` | Conversation updated |
| `typing:indicator` | Bidirectional | `{conversationId, isTyping}` | Typing status |

### Widget Events (/visitor namespace)

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `message:send` | Client→Server | `{text, mediaUrl?}` | Visitor sends message |
| `message:sent` | Server→Client | `{messageId, conversationId}` | Send confirmation |
| `message:received` | Server→Client | `{message}` | Agent reply received |
| `message:error` | Server→Client | `{error}` | Send failed |
| `conversation:restored` | Server→Client | `{messages[]}` | Chat history restored |

---

## Error Handling

### Message Send Failures

```mermaid
flowchart TD
    A[Send Message] --> B{Platform API Response}
    B -->|Success| C[Update status: SENT]
    B -->|Token Expired| D[Refresh Token]
    D --> E{Refresh Success?}
    E -->|Yes| F[Retry Send]
    E -->|No| G[Update status: FAILED]
    B -->|Other Error| G
    F --> B

    C --> H[Emit status notification]
    G --> H
```

### Widget Retry Flow

```mermaid
flowchart TD
    A[User sends message] --> B{Socket connected?}
    B -->|Yes| C[Send via WebSocket]
    B -->|No| D[Show failed + retry button]
    C --> E{Server response}
    E -->|message:sent| F[Mark as sent]
    E -->|message:error| D
    D --> G[User clicks retry]
    G --> A
```

---

## Files Reference

| Component | File Path |
|-----------|-----------|
| WebSocket Gateway | `backend/src/modules/websocket/websocket.gateway.ts` |
| Visitor Gateway | `backend/src/modules/websocket/visitor.gateway.ts` |
| WS Bridge Consumer | `backend/src/modules/websocket/websocket-bridge.consumer.ts` |
| Visitor Message Service | `backend/src/modules/websocket/visitor-message.service.ts` |
| Message Sender Consumer | `backend/src/infra/kafka/consumers/message-sender.consumer.ts` |
| Messages Service | `backend/src/modules/messages/messages.service.ts` |
| Webhook Processor | `backend/src/modules/platforms/core/services/webhook-processor.service.ts` |
| Platform Adapters | `backend/src/modules/platforms/adapters/*.adapter.ts` |
| Widget Socket | `frontend/widget/src/socket.ts` |
| Frontend WS Events | `frontend/lib/websocket/useConversationWebSocketEvents.ts` |
