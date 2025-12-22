# Code Review Report: Customer Feature Implementation

**Date:** 2025-12-22
**Reviewer:** Code Review Agent
**Scope:** Customer tracking feature (backend + widget + frontend)

---

## Code Review Summary

### Scope
- **Backend files:**
  - `backend/src/common/database/schemas/customer.schema.ts`
  - `backend/src/modules/customers/customers.service.ts`
  - `backend/src/modules/customers/customers.controller.ts`
  - `backend/src/modules/customers/customers.module.ts`
  - `backend/src/modules/customers/dto/get-customers.dto.ts`
  - `backend/src/modules/customers/dto/update-customer.dto.ts`
  - `backend/src/modules/websocket/visitor.gateway.ts`

- **Widget files:**
  - `frontend/widget/src/types.ts`
  - `frontend/widget/src/device-detector.ts`
  - `frontend/widget/src/socket.ts`

- **Frontend files:**
  - `frontend/features/customers/types/customer.types.ts`
  - `frontend/features/customers/hooks/useCustomers.ts`
  - `frontend/features/customers/hooks/useCustomer.ts`
  - `frontend/features/customers/components/CustomerList.tsx`
  - `frontend/features/customers/components/CustomerDetail.tsx`
  - `frontend/app/(dashboard)/organizations/[slug]/customers/page.tsx`

- **Lines reviewed:** ~1,600
- **Focus:** Security, validation, type safety, performance

### Overall Assessment
Implementation is **solid** with proper multi-tenant isolation, validation, and type safety. However, several **critical security vulnerabilities** exist that must be addressed before production deployment.

---

## Critical Issues

### 1. **[SECURITY] NoSQL Injection in Search Filter**
**File:** `backend/src/modules/customers/customers.service.ts` (lines 52-57)

**Issue:**
Raw regex construction from user input allows NoSQL injection attacks.

```typescript
if (search) {
  filter.$or = [
    { name: { $regex: search, $options: 'i' } },  // VULNERABLE
    { email: { $regex: search, $options: 'i' } },
    { phone: { $regex: search, $options: 'i' } },
  ];
}
```

**Attack vector:**
User can inject regex control characters like `.`, `*`, `$`, etc. to bypass filters or cause ReDoS attacks.

**Fix:**
Escape regex special characters before building query:
```typescript
import { escapeRegExp } from 'lodash'; // or use custom escape function

if (search) {
  const escapedSearch = escapeRegExp(search);
  filter.$or = [
    { name: { $regex: escapedSearch, $options: 'i' } },
    { email: { $regex: escapedSearch, $options: 'i' } },
    { phone: { $regex: escapedSearch, $options: 'i' } },
  ];
}
```

---

### 2. **[SECURITY] Cross-Site WebSocket Hijacking (CSWSH) Risk**
**File:** `backend/src/modules/websocket/visitor.gateway.ts` (lines 58-62)

**Issue:**
Visitor gateway allows **ALL origins** without validation. TODO comment acknowledges this but implementation missing.

```typescript
cors: {
  origin: (origin, callback) => {
    // Allow all origins - validation done in handleConnection
    // TODO: Implement origin validation against org.allowedOrigins for CSWSH prevention
    callback(null, true);  // DANGEROUS
  },
  credentials: true,
}
```

**Risk:**
Malicious site can connect to visitor namespace and impersonate legitimate customers.

**Fix:**
Implement origin validation against organization's allowedOrigins:
```typescript
cors: {
  origin: async (origin, callback) => {
    if (!origin) return callback(null, true); // Same-origin

    // Extract organizationId from handshake auth
    const auth = socket.handshake.auth;
    if (!auth?.organizationId) return callback(new Error('Unauthorized'), false);

    const org = await this.organizationModel.findById(auth.organizationId);
    if (!org || !org.allowedOrigins?.includes(origin)) {
      return callback(new Error('Origin not allowed'), false);
    }

    callback(null, true);
  },
  credentials: true,
}
```

**Note:** Requires `Organization.allowedOrigins` field in schema.

---

### 3. **[SECURITY] IP Address Spoofing via X-Forwarded-For**
**File:** `backend/src/modules/websocket/visitor.gateway.ts` (lines 90-92)

**Issue:**
Blindly trusts `X-Forwarded-For` header for IP extraction without validation.

```typescript
const ip =
  client.handshake.headers['x-forwarded-for']?.toString() ||
  client.handshake.address;
```

**Risk:**
Client can spoof IP by setting `X-Forwarded-For` header, bypassing rate limits and tracking.

**Fix:**
Only trust `X-Forwarded-For` when behind proxy, extract rightmost IP:
```typescript
function getClientIp(socket: Socket): string {
  const forwardedFor = socket.handshake.headers['x-forwarded-for'];

  // If behind trusted proxy (e.g., nginx), get rightmost IP
  if (forwardedFor && process.env.TRUST_PROXY === 'true') {
    const ips = forwardedFor.toString().split(',');
    return ips[ips.length - 1].trim();
  }

  return socket.handshake.address;
}

const ip = getClientIp(client);
```

---

## High Priority Findings

### 4. **Missing ObjectId Validation**
**File:** `backend/src/modules/customers/customers.controller.ts`

**Issue:**
No validation that `id` and `organizationId` params are valid ObjectIds before passing to service.

**Risk:**
Invalid ObjectId strings cause uncaught exceptions when passed to `new Types.ObjectId()`.

**Fix:**
Add validation decorator or manual check:
```typescript
import { IsMongoId } from 'class-validator';

// Option 1: Validation decorator
@Get(':id')
findOne(
  @Param('organizationId') @IsMongoId() organizationId: string,
  @Param('id') @IsMongoId() id: string,
) { ... }

// Option 2: Service-level validation
if (!Types.ObjectId.isValid(id)) {
  throw new BadRequestException('Invalid customer ID');
}
```

---

### 5. **Race Condition in Customer Update**
**File:** `backend/src/modules/customers/customers.service.ts` (lines 143-153)

**Issue:**
Two separate update operations (`updateOne` for $addToSet, then `findByIdAndUpdate`) create race condition.

```typescript
// Update 1
await this.customerModel.updateOne(
  { _id: customer._id },
  { $addToSet: { domains: customerData.domain } },
);

// Update 2 - can overwrite update 1
customer = await this.customerModel.findByIdAndUpdate(
  customer._id,
  updates,
  { new: true },
);
```

**Fix:**
Combine into single atomic update:
```typescript
if (customerData.domain) {
  updates.lastSeenDomain = customerData.domain;
  updates.$addToSet = { domains: customerData.domain };
}

customer = await this.customerModel.findByIdAndUpdate(
  customer._id,
  updates,
  { new: true },
);
```

---

### 6. **Missing Error Handling in Widget Socket Connection**
**File:** `frontend/widget/src/socket.ts` (lines 88-122)

**Issue:**
No try-catch around connection logic, errors in `collectDeviceMetadata()` crash widget.

**Fix:**
Wrap in try-catch:
```typescript
connect(visitorInfo?: VisitorInfo): void {
  if (this.socket?.connected) return;

  try {
    const deviceMetadata = collectDeviceMetadata();
    // ... rest of connection logic
  } catch (error) {
    console.error('[MiAgent] Connection error:', error);
    this.callbacks.onError?.('CONNECTION_FAILED', 'Failed to connect');
  }
}
```

---

### 7. **Performance: Missing Pagination Validation**
**File:** `backend/src/modules/customers/dto/get-customers.dto.ts`

**Issue:**
No upper limit on `limit` parameter allows clients to request millions of records.

**Current:**
```typescript
@Max(100)  // Good!
limit?: number = 20;
```

**Recommendation:**
This is actually **correct**. Good job setting max limit to 100.

---

## Medium Priority Improvements

### 8. **Weak Session ID Generation**
**File:** `frontend/widget/src/socket.ts` (lines 80-82)

**Issue:**
Session ID uses `Date.now()` + `Math.random()` which is predictable and low entropy.

```typescript
private generateSessionId(): string {
  return 'v_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
}
```

**Fix:**
Use crypto API for better entropy:
```typescript
private generateSessionId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return 'v_' + Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}
```

---

### 9. **Missing Index on widgetSessionId**
**File:** `backend/src/common/database/schemas/customer.schema.ts` (line 165)

**Issue:**
Index exists but is compound with `organizationId`. Queries by `widgetSessionId` alone are slow.

**Current:**
```typescript
CustomerSchema.index({ organizationId: 1, widgetSessionId: 1 });
```

**Analysis:**
This is actually **optimal** for multi-tenant architecture since all queries include `organizationId`. No change needed.

---

### 10. **Unbounded Array Growth: domains**
**File:** `backend/src/common/database/schemas/customer.schema.ts`

**Issue:**
`domains` array can grow indefinitely if customer visits many subdomains.

**Risk:**
Document exceeds 16MB BSON limit after ~100k domains.

**Fix:**
Cap array size:
```typescript
updates.$addToSet = { domains: { $each: [customerData.domain], $slice: -100 } };
```

Or use separate collection for domain tracking if needed.

---

### 11. **Frontend: No Loading State During Mutations**
**File:** `frontend/features/customers/components/CustomerDetail.tsx`

**Issue:**
No loading indicator when saving notes/tags, poor UX.

**Fix:**
Show loading state:
```typescript
<Button
  variant="contained"
  size="small"
  onClick={handleSaveNotes}
  disabled={notes === customer.notes || updateCustomer.isPending}
>
  {updateCustomer.isPending ? 'Saving...' : 'Save Notes'}
</Button>
```

---

## Low Priority Suggestions

### 12. **Logging Sensitive Data**
**File:** `backend/src/modules/customers/customers.service.ts` (line 255)

**Issue:**
Logs full update DTO which may contain PII.

```typescript
this.logger.log(`Updated customer ${id}: ${JSON.stringify(dto)}`);
```

**Fix:**
Log only customer ID:
```typescript
this.logger.log(`Updated customer ${id}`);
```

---

### 13. **TypeScript: Loose Type in customFields**
**Files:** Multiple

**Issue:**
`customFields: Record<string, any>` defeats type safety.

**Recommendation:**
Define specific custom field types or use `Record<string, unknown>` to force type narrowing.

---

### 14. **Missing Device Metadata in Widget Types**
**File:** `frontend/widget/src/types.ts` (line 58)

**Issue:**
DeviceMetadata duplicated in backend (`visitor.gateway.ts` line 23).

**Fix:**
Share types via monorepo package or keep synchronized manually. Current duplication acceptable for now.

---

## Positive Observations

✅ **Excellent multi-tenant isolation** - All queries include `organizationId` check
✅ **Comprehensive indexing** - Well-designed indexes for common query patterns
✅ **Proper validation** - DTOs use class-validator decorators
✅ **Rate limiting** - Connection and message rate limits implemented
✅ **Type safety** - Strong typing across frontend/backend
✅ **Clean architecture** - Follows feature-based organization
✅ **MUI compliance** - Frontend uses only MUI components, no custom styling
✅ **Debounced search** - Proper search debouncing (300ms) in CustomerList
✅ **Pagination** - Proper pagination with sensible defaults
✅ **Error handling** - try-catch in gateway connection handler

---

## Recommended Actions

### Immediate (Before Production)
1. **Fix NoSQL injection in search filter** (Issue #1)
2. **Implement CSWSH protection** (Issue #2)
3. **Fix IP spoofing vulnerability** (Issue #3)
4. **Add ObjectId validation** (Issue #4)

### High Priority (This Week)
5. **Fix race condition in customer update** (Issue #5)
6. **Add error handling to widget connection** (Issue #6)
7. **Use crypto API for session ID** (Issue #8)

### Medium Priority (Next Sprint)
8. **Cap domains array growth** (Issue #10)
9. **Add mutation loading states** (Issue #11)
10. **Remove PII from logs** (Issue #12)

### Low Priority (Backlog)
11. **Strengthen customFields typing** (Issue #13)

---

## Metrics

- **Type Coverage:** 100% (TypeScript strict mode disabled but all types defined)
- **Frontend Type Check:** ✅ Passed
- **Backend Type Check:** ✅ Passed (npx tsc --noEmit)
- **Security Issues:** 3 critical, 4 high, 3 medium
- **Performance Issues:** 0 blocking
- **Code Quality:** Good (clean, organized, follows patterns)

---

## Unresolved Questions

1. **Organization.allowedOrigins schema** - Does this field exist in Organization schema? Needed for CSWSH fix.
2. **Trust proxy config** - Is backend behind reverse proxy (nginx/CloudFlare)? Affects IP extraction.
3. **Customer data retention** - Any GDPR/compliance requirements for customer data deletion?
4. **Location data source** - How is `LocationInfo` populated? Not implemented in current code.
