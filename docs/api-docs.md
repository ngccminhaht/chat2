# API Documentation

Backend API documentation for the Omnichannel Chat Platform.

## Base URL
- Development: `http://localhost:3000/api`
- Production: Set via environment variable

## Authentication

Most endpoints require JWT authentication via the `Authorization` header:
```
Authorization: Bearer {accessToken}
```

Token is obtained from the authentication endpoints and auto-refreshed by the frontend client.

---

## Public Endpoints

These endpoints do not require authentication.

### Widget Configuration

#### Get Widget Config
Retrieve widget configuration for embedding in external websites.

```
GET /widget/:orgSlug/config
```

**Parameters:**
- `orgSlug` (path, required): Organization slug identifier

**Headers:**
- `Accept: application/json`
- CORS enabled for all origins (widget must be embeddable)

**Cache:**
- `Cache-Control: public, max-age=60, stale-while-revalidate=300`
- Cached for 60 seconds, can serve stale for up to 5 minutes

**Response (200 OK):**
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

**Response (404 Not Found):**
```json
{
  "statusCode": 404,
  "message": "Organization not found"
}
```

**Use Cases:**
- Embed chat widget on external websites
- Configure widget appearance and behavior
- Display organization branding
- Show greeting and offline messages

**Example Request:**
```bash
curl "http://localhost:3000/api/widget/acme-corp/config"
```

**Frontend Integration:**
```typescript
// lib/api/client.ts
const widgetConfig = await axios.get(`/widget/acme-corp/config`);

// Use in widget embed script
window.WidgetConfig = widgetConfig.data;
```

---

## Authenticated Endpoints

All endpoints below require JWT authentication.

### Authentication

#### Login
```
POST /auth/login
```

Request body:
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

Response:
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "agent"
  }
}
```

#### Refresh Token
```
POST /auth/refresh
```

Request body:
```json
{
  "refreshToken": "eyJ..."
}
```

Response:
```json
{
  "accessToken": "eyJ..."
}
```

---

### Conversations

#### List Conversations
```
GET /conversations?page=1&limit=20
```

Query parameters:
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)
- `status` (optional): Filter by status (open|pending|resolved|closed)
- `assignedTo` (optional): Filter by assigned user ID

Response:
```json
{
  "data": [
    {
      "id": "507f1f77bcf86cd799439011",
      "organizationId": "507f1f77bcf86cd799439012",
      "platform": "facebook",
      "status": "open",
      "assignedTo": "507f1f77bcf86cd799439013",
      "lastMessage": {
        "text": "Hello!",
        "timestamp": "2024-01-15T10:30:00Z"
      },
      "unreadCount": 3
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

#### Get Conversation
```
GET /conversations/:id
```

#### Update Conversation
```
PATCH /conversations/:id
```

Request body:
```json
{
  "status": "closed",
  "assignedTo": "507f1f77bcf86cd799439013"
}
```

---

### Messages

#### List Messages
```
GET /conversations/:conversationId/messages?page=1&limit=50
```

Query parameters:
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 50)

Response:
```json
{
  "data": [
    {
      "id": "507f1f77bcf86cd799439011",
      "conversationId": "507f1f77bcf86cd799439012",
      "platform": "facebook",
      "direction": "inbound",
      "type": "text",
      "content": {
        "text": "I have a question about my order",
        "mediaUrl": null
      },
      "sender": {
        "platformUserId": "123456789",
        "name": "Jane Customer"
      },
      "status": "delivered",
      "timestamp": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 200,
    "totalPages": 4
  }
}
```

#### Send Message
```
POST /messages/send
```

Request body:
```json
{
  "conversationId": "507f1f77bcf86cd799439011",
  "type": "text",
  "content": {
    "text": "Thank you for contacting us!"
  }
}
```

Response:
```json
{
  "id": "507f1f77bcf86cd799439020",
  "conversationId": "507f1f77bcf86cd799439011",
  "status": "pending",
  "type": "text",
  "content": {
    "text": "Thank you for contacting us!"
  },
  "timestamp": "2024-01-15T10:35:00Z"
}
```

---

### Platform Connections

#### List Connections
```
GET /connections
```

Response:
```json
[
  {
    "id": "507f1f77bcf86cd799439011",
    "platform": "facebook",
    "platformAccountName": "Acme Corp Business Page",
    "status": "active",
    "lastSyncAt": "2024-01-15T10:30:00Z"
  }
]
```

#### Create Connection (OAuth)
```
GET /connections/:platform/auth-url
```

Parameters:
- `platform`: facebook|zalo|shopee|tiktok

Response:
```json
{
  "authUrl": "https://facebook.com/oauth/authorize?client_id=..."
}
```

#### OAuth Callback
```
GET /connections/:platform/callback?code=...&state=...
```

---

## WebSocket Events

Real-time communication via Socket.IO connection.

### Server → Client Events

#### New Message
```
message:new
```
Payload:
```json
{
  "messageId": "507f1f77bcf86cd799439011",
  "conversationId": "507f1f77bcf86cd799439012",
  "type": "text",
  "content": "New message text",
  "sender": "John",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### Message Status Changed
```
message:status
```
Payload:
```json
{
  "messageId": "507f1f77bcf86cd799439011",
  "status": "delivered"
}
```

#### Typing Indicator
```
typing:indicator
```
Payload:
```json
{
  "conversationId": "507f1f77bcf86cd799439011",
  "userId": "507f1f77bcf86cd799439013",
  "userName": "John",
  "isTyping": true
}
```

### Client → Server Events

#### Join Conversation
```
join:conversation
```
Payload:
```json
{
  "conversationId": "507f1f77bcf86cd799439011"
}
```

#### Start Typing
```
typing:start
```
Payload:
```json
{
  "conversationId": "507f1f77bcf86cd799439011"
}
```

---

## Error Handling

All endpoints follow consistent error response format:

```json
{
  "statusCode": 400,
  "message": "Error description",
  "error": "BadRequest"
}
```

Common status codes:
- `200`: Success
- `201`: Created
- `204`: No content
- `400`: Bad request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not found
- `409`: Conflict
- `500`: Internal server error

---

## Rate Limiting

Rate limits are applied per endpoint:
- General endpoints: 100 requests per minute
- Webhook endpoints: No limit (platform-to-server)
- Authentication: 5 requests per minute per IP

---

## Version History

### v1.0 (Current)
- Widget public endpoint added
- Web platform support for chat widget integration

---

## Support

For API questions or issues, refer to the project README or contact the development team.
