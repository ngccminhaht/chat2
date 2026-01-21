# Single Organization Per Page Constraint

## Business Requirement

**Each Facebook page can only be connected to ONE organization** in the system. If a different organization tries to connect a page that's already linked to another organization, the system will reject the connection with a clear error message.

## Implementation

### 1. Database Schema Constraint

**Location:** `backend/src/common/database/schemas/platform-connection.schema.ts`

Added **global unique index** on `(platform, platformAccountId)`:

```typescript
// GLOBAL unique constraint: One page can only be connected to ONE organization
PlatformConnectionSchema.index(
  { platform: 1, platformAccountId: 1 },
  { unique: true },
);
```

This enforces at database level that the same page cannot be connected to multiple organizations.

### 2. Application-Level Validation

**Location:** `backend/src/modules/platforms/facebook/facebook.service.ts`

In `savePlatformConnection()` method, added validation logic:

```typescript
// Check if this page is already connected to ANY organization (global check)
const existingGlobal = await this.platformConnectionModel
  .findOne({
    platform: 'facebook',
    platformAccountId: pageInfo.id,
  })
  .exec();

if (existingGlobal) {
  // Same organization reconnecting - ALLOW (update)
  if (existingGlobal.organizationId.toString() === organizationId) {
    // Update existing connection...
    return savedConnection;
  } else {
    // Different organization - REJECT
    throw new BadRequestException(
      `This Facebook page "${pageInfo.name}" is already connected to another organization. ` +
      `Each page can only be connected to one organization at a time.`
    );
  }
}
```

## Behavior

### Connecting a Page

**Scenario 1: First Connection**
- Org A connects page_123 → ✅ Success
- page_123 is now owned by Org A

**Scenario 2: Same Organization Reconnects**
- Org A reconnects page_123 → ✅ Success (updates existing connection)
- Credentials refreshed, status updated

**Scenario 3: Different Organization Attempts Connection**
- Org B tries to connect page_123 → ❌ Error
- Error message: "This Facebook page is already connected to another organization"

### User Experience

When Org B tries to connect an already-connected page:
```
{
  "statusCode": 400,
  "message": "This Facebook page \"My Page\" is already connected to another organization. Each page can only be connected to one organization at a time. Please disconnect it from the other organization first, or contact support.",
  "error": "Bad Request"
}
```

## Files Modified

### 1. Platform Connection Schema
**File:** `backend/src/common/database/schemas/platform-connection.schema.ts`

- Added global unique index on `(platform, platformAccountId)`
- Removed per-org unique index `(organizationId, platform, platformAccountId)`

### 2. Facebook Service (OAuth Logic)
**File:** `backend/src/modules/platforms/facebook/facebook.service.ts`

- Added global check for existing connections before creating new ones
- Throws `BadRequestException` if different org tries to connect same page
- Allows same org to reconnect (updates credentials)

### 3. Webhook Processor (Reverted)
**File:** `backend/src/modules/platforms/core/services/webhook-processor.service.ts`

- Uses `findOne()` (not `find()`) - only one connection exists per page
- Simplified processing logic - no multi-org loop needed

### 4. Unit Tests
**File:** `backend/src/modules/platforms/core/services/webhook-processor.service.spec.ts`

- Removed multi-org test case (no longer valid)
- All 9 tests pass

## Technical Details

### Message Flow (Single-Org)

```
Facebook Webhook
    ↓
Extract accountId (e.g., page_123)
    ↓
Find ONE connection with platformAccountId = page_123
    ↓
Connection found (Org A)
    ↓
Process events for Org A
    ↓
Save message to Org A's database
    ↓
Publish WebSocket notification to Org A agents
```

### Database Constraints

**Global unique constraint:**
```typescript
PlatformConnectionSchema.index(
  { platform: 1, platformAccountId: 1 },
  { unique: true }
);
```

This means:
- ✅ facebook + page_123 → Can exist ONCE
- ❌ facebook + page_123 → Cannot create again (MongoDB duplicate key error)

**Message deduplication (per organization):**
```typescript
MessageSchema.index(
  { organizationId: 1, platform: 1, platformMessageId: 1 },
  { unique: true }
);
```

### Logging Example

```
🔍 Processing facebook webhook for account: page_123
✅ Found platform connection: 507f1f77bcf86cd799439011
📦 Extracted 1 events from payload
✅ Message processed successfully
```

## Testing

### Unit Tests
```bash
cd backend
npm test -- webhook-processor.service.spec.ts
```

All 9 tests pass (multi-org test removed).

### Manual Testing

**Test 1: First Connection**
1. Login to Org A
2. Connect Page "Test Page" → ✅ Success
3. Verify page appears in connections list

**Test 2: Same Org Reconnects**
1. Disconnect "Test Page" from Org A
2. Reconnect "Test Page" to Org A → ✅ Success (updates credentials)

**Test 3: Different Org Attempts Connection**
1. Login to Org B (different organization)
2. Try to connect "Test Page" → ❌ Error
3. Verify error message: "This Facebook page is already connected to another organization"

**Test 4: Webhook Delivery**
1. Send message to connected page via Facebook
2. Verify only the owning organization receives the message

## Migration Notes

This is a **BREAKING change** if you had multiple organizations connected to the same page:
- Existing connections: First connection survives, others will fail on next update
- Database migration: Run migration to remove duplicate connections
- Admin UI: Add page "ownership" management (transfer page between orgs)

**Migration script needed:**
```typescript
// Find duplicate pages (same platformAccountId)
// Keep the oldest connection, delete others
// Notify affected organizations
```

## Business Implications

### Pros
- Clear ownership model - no confusion about which org owns a page
- Simpler debugging - messages go to exactly one organization
- No duplicate webhook processing
- Prevents data leakage between organizations

### Cons
- Pages cannot be shared between organizations (by design)
- Requires admin intervention to transfer page ownership
- May require UI changes to show "Page already connected" state

## Future Improvements

- **Page Transfer Feature**: Allow admins to transfer page ownership between orgs
- **Page Ownership UI**: Show which org owns each page in admin panel
- **Connection Request System**: Allow orgs to "request" connection to a page
- **Shared Pages** (if needed): Add optional "shared" flag to allow multi-org access
