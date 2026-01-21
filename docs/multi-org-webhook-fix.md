# Multi-Organization Webhook Processing Fix

## Problem

When a Facebook page was connected to multiple organizations, only the **first organization** received incoming messages. This was because the webhook processor used `findOne()` which only returned a single connection.

## Root Cause

**Location:** `backend/src/modules/platforms/core/services/webhook-processor.service.ts`

The `findConnection()` method used `findOne()` to search for platform connections:

```typescript
// ❌ OLD - Only returns ONE connection
private async findConnection(
  platform: Platform,
  accountId: string
): Promise<PlatformConnectionDocument | null> {
  return this.platformConnectionModel
    .findOne({
      platform,
      platformAccountId: accountId,
    })
    .exec();
}
```

This meant only the first organization that connected the page would receive messages.

## Solution

Changed the method to return **ALL** connections for the same page:

```typescript
// ✅ NEW - Returns ALL connections for the same page
private async findConnections(
  platform: Platform,
  accountId: string
): Promise<PlatformConnectionDocument[]> {
  return this.platformConnectionModel
    .find({  // Changed from findOne() to find()
      platform,
      platformAccountId: accountId,
    })
    .exec();
}
```

Then updated the `process()` method to iterate through all connections and process events for each organization:

```typescript
// Find ALL platform connections for this account
const connections = await this.findConnections(platform, accountId);

// Process each event for EACH connection (organization)
for (const connection of connections) {
  for (const event of events) {
    const processed = await this.processEvent(adapter, event, connection);
    // ...
  }
}
```

## Impact

### Before Fix
- Page connected to Org A: ✅ Receives messages
- Same page connected to Org B: ❌ Does NOT receive messages
- Same page connected to Org C: ❌ Does NOT receive messages

### After Fix
- Page connected to Org A: ✅ Receives messages
- Same page connected to Org B: ✅ Receives messages
- Same page connected to Org C: ✅ Receives messages

## Changes Made

### 1. Webhook Processor Service
**File:** `backend/src/modules/platforms/core/services/webhook-processor.service.ts`

- Renamed `findConnection()` → `findConnections()` (now returns array)
- Updated `process()` to loop through all connections
- Added logging to show which organization is processing each event

### 2. Unit Tests
**File:** `backend/src/modules/platforms/core/services/webhook-processor.service.spec.ts`

Added new test case: `should process webhook for multiple organizations connected to same page`

**Test scenario:**
- 2 organizations connect to the same Facebook page
- 1 message arrives via webhook
- Both organizations should receive the message

**Test result:** ✅ All 10 tests pass

## Technical Details

### Message Flow (Multi-Org)

```
Facebook Webhook
    ↓
Extract accountId (e.g., page_123)
    ↓
Find ALL connections with platformAccountId = page_123
    ↓
    ├─→ Connection 1 (Org A)
    │       ↓
    │   Process events for Org A
    │       ↓
    │   Save message to Org A's database
    │       ↓
    │   Publish WebSocket notification to Org A agents
    │
    ├─→ Connection 2 (Org B)
    │       ↓
    │   Process events for Org B
    │       ↓
    │   Save message to Org B's database
    │       ↓
    │   Publish WebSocket notification to Org B agents
    │
    └─→ Connection 3 (Org C)
            ↓
        Process events for Org C
            ↓
        Save message to Org C's database
            ↓
        Publish WebSocket notification to Org C agents
```

### Deduplication

Each organization maintains its own message deduplication via:
- `organizationId + platform + platformMessageId` unique index

This ensures messages are not duplicated **within** an organization, while allowing the **same message** to be saved for **different organizations**.

### Logging Example

```
🔍 Processing facebook webhook for account: page_123
✅ Found 3 platform connection(s): 507f..., 507e..., 507d...
📦 Extracted 1 events from payload
🔄 Processing events for organization: 507f... (connection: 507f...)
✅ Message processed for org 507f...
🔄 Processing events for organization: 507e... (connection: 507e...)
✅ Message processed for org 507e...
🔄 Processing events for organization: 507c... (connection: 507d...)
✅ Message processed for org 507c...
```

## Testing

### Unit Tests
```bash
cd backend
npm test -- webhook-processor.service.spec.ts
```

All 10 tests pass, including the new multi-org test.

### Manual Testing

1. Connect Page A to Organization 1
2. Connect Page A to Organization 2 (same page)
3. Send message to Page A via Facebook
4. Verify both organizations receive the message in their inbox

## Migration Notes

This is a **non-breaking change**:
- Existing single-organization connections work exactly as before
- No database schema changes required
- No API changes required
- Backward compatible with all existing webhooks

## Performance Impact

Minimal performance impact:
- Database query changed from `findOne()` to `find()` (same index used)
- Processing time increases linearly with number of organizations (typically 1-5 orgs per page)
- Each organization's message processing is independent (no blocking)

## Future Improvements

- Add batch processing for very large numbers of organizations (>10)
- Add configuration to limit max organizations per page
- Add metrics to track webhook processing time per organization
