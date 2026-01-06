# Debug Report: Login/Organizations Redirect Loop

**Date:** 2026-01-06
**Issue:** Infinite redirect loop between `/login` and `/organizations/new`
**Severity:** Critical - Blocks user authentication flow

## Executive Summary

**Root Cause:** Race condition between `OnboardingGuard` (not currently used) and `LoginForm` authentication state detection, compounded by lack of routing guards on critical auth routes.

**Critical Finding:** OnboardingGuard component exists but is NOT mounted anywhere in the app layout tree - no route protection currently active.

**Immediate Issue:** LoginForm redirects authenticated users to `/organizations/new`, but `/organizations/new` has no guard preventing unauthenticated access, creating potential for redirect loops when auth state is inconsistent.

## Technical Analysis

### Component Interaction Flow

#### LoginForm (`frontend/features/auth/components/LoginForm.tsx`)

**Lines 18-28: Redirect Logic**
```typescript
useEffect(() => {
  if (!hasHydrated || !initialized) return;

  if (authenticated && accessToken) {
    if (organization?.slug) {
      router.replace(`/organizations/${organization.slug}/conversations`);
    } else {
      router.replace('/organizations/new');  // ← REDIRECT 1
    }
  }
}, [authenticated, accessToken, organization, hasHydrated, initialized, router]);
```

**Triggers:** When Keycloak `authenticated=true` AND authStore `accessToken` exists AND no organization slug

#### OnboardingGuard (`frontend/components/guards/OnboardingGuard.tsx`)

**Lines 43-50: Unauthenticated Redirect**
```typescript
// Not authenticated - redirect to login page (unless already on auth route)
if (!authenticated || !accessToken) {
  if (!isAuthRoute) {
    router.replace('/login');  // ← REDIRECT 2
  }
  setIsChecking(false);
  return;
}
```

**Lines 52-59: No Organization Redirect**
```typescript
// Authenticated but no organization - redirect to onboarding
if (!hasOrganization) {
  if (!isOnboardingRoute) {
    router.replace('/organizations/new');
  }
  setIsChecking(false);
  return;
}
```

**CRITICAL:** OnboardingGuard NOT mounted in any layout - no actual routing protection currently active.

### State Synchronization Issues

#### Keycloak vs authStore State Inconsistency

**KeycloakProvider** (`frontend/lib/keycloak/KeycloakProvider.tsx`)

**Lines 84-100: Token Processing**
```typescript
if (auth && kc.token) {
  // Set token in API client
  apiClient.defaults.headers.common['Authorization'] = `Bearer ${kc.token}`;

  // Extract user info from token
  const tokenParsed = kc.tokenParsed as any;
  if (tokenParsed) {
    const user = {
      id: tokenParsed.sub,
      email: tokenParsed.email,
      name: tokenParsed.name || tokenParsed.preferred_username,
      avatarUrl: tokenParsed.picture || null,
    };

    // Update user and tokens only, preserve organization data from localStorage
    updateUserAndTokens(user, kc.token, kc.refreshToken || '');
  }

  setupTokenRefresh(kc);
}
```

**Lines 38-43: State Variables**
```typescript
const [keycloak, setKeycloak] = useState<Keycloak | null>(null);
const [initialized, setInitialized] = useState(false);
const [authenticated, setAuthenticated] = useState(false);
```

**Issue:** Three distinct initialization flags create race condition windows:
1. `KeycloakProvider.initialized` - Keycloak SDK ready
2. `KeycloakProvider.authenticated` - Keycloak session exists
3. `authStore._hasHydrated` - Zustand store loaded from localStorage
4. `authStore.accessToken` - Token value present

#### Timing Sequence (Normal Flow)

```
T0: Page load
T1: KeycloakProvider mounts, starts init (initialized=false, authenticated=false)
T2: authStore hydrates from localStorage (_hasHydrated=true, accessToken may exist)
T3: Keycloak init completes (initialized=true, authenticated=true if SSO session exists)
T4: updateUserAndTokens called (authStore.accessToken set)
T5: Components render with fully synced state
```

#### Timing Sequence (Loop Trigger)

```
T0: Page load at /login
T1: authStore hydrates (_hasHydrated=true, accessToken=null from cleared storage)
T2: Keycloak init completes (initialized=true, authenticated=true from SSO)
T3: LoginForm useEffect runs:
    - hasHydrated=true ✓
    - initialized=true ✓
    - authenticated=true ✓
    - accessToken=null (not yet set) ✗
    - WAITS (no redirect yet)
T4: updateUserAndTokens sets accessToken
T5: LoginForm useEffect re-runs:
    - All conditions met
    - Redirects to /organizations/new
T6: User lands on /organizations/new
T7: No guard on this route - page renders
T8: If organization creation fails or user navigates back
    - LoginForm detects authenticated + no org
    - Redirects back to /organizations/new
    - Loop continues
```

### Architecture Gaps

#### Missing Route Protection

**Current Layout Structure:**
```
app/
├── layout.tsx (root)
│   └── providers.tsx (KeycloakProvider, WebSocketProvider, etc.)
├── (auth)/
│   ├── login/page.tsx → LoginForm (NO LAYOUT GUARD)
│   └── register/page.tsx (NO LAYOUT GUARD)
├── (org-selector)/
│   └── organizations/
│       ├── layout.tsx (NO GUARD - just Header + Container)
│       ├── new/page.tsx → CreateOrganizationForm
│       └── page.tsx
└── (dashboard)/
    └── layout.tsx (NO GUARD)
```

**OnboardingGuard:** Exists but not used anywhere (dead code).

#### State Dependencies

**LoginForm** depends on:
- `useKeycloak()` → `initialized`, `authenticated`
- `authStore` → `accessToken`, `organization`, `_hasHydrated`

**Condition for redirect:**
```typescript
if (!hasHydrated || !initialized) return;  // Wait for both
if (authenticated && accessToken) {        // Then check auth
  // Redirect logic
}
```

**Problem:** `authenticated` can be `true` before `accessToken` is set, but the guard waits for both flags before checking, so initial check passes, then re-triggers when token arrives.

#### Organization State Management

**authStore Schema:**
```typescript
{
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  organizationId: string | null;
  organization: CurrentOrganization | null;  // Current active org
  organizations: Organization[];             // All orgs user belongs to
}
```

**LoginForm Logic:**
```typescript
const organization = useAuthStore((state) => state.organization);

if (organization?.slug) {
  router.replace(`/organizations/${organization.slug}/conversations`);
} else {
  router.replace('/organizations/new');
}
```

**Issue:** Only checks `organization` (singular), not `organizations` array. User may belong to orgs but not have active selection.

**OnboardingGuard Logic (unused):**
```typescript
const hasOrganization = organizationId || (organizations && organizations.length > 0);
```

Better - checks both current selection and membership.

## Root Cause Identification

### Primary Cause: No Route Guards Mounted

OnboardingGuard component exists with comprehensive routing logic but is **not used in any layout file**:

```bash
$ grep -r "OnboardingGuard" frontend/app/
# No results
```

All routes are currently unprotected. The redirect loop happens purely within LoginForm's internal logic.

### Secondary Cause: Race Condition in LoginForm

**Problematic useEffect dependency array:**
```typescript
}, [authenticated, accessToken, organization, hasHydrated, initialized, router]);
```

When `accessToken` changes from `null` to a value, effect re-runs and triggers redirect even if already on correct page.

### Tertiary Cause: Missing Organization List Check

LoginForm checks `organization?.slug` (current active org) but not `organizations.length` (user membership). User authenticated without active org selection gets sent to `/organizations/new` even if they belong to existing orgs.

## Evidence from Code

### LoginForm Redirect Logic (Lines 18-28)

```typescript
useEffect(() => {
  if (!hasHydrated || !initialized) return;

  if (authenticated && accessToken) {
    if (organization?.slug) {
      router.replace(`/organizations/${organization.slug}/conversations`);
    } else {
      router.replace('/organizations/new');  // ← Unconditional redirect
    }
  }
}, [authenticated, accessToken, organization, hasHydrated, initialized, router]);
```

**No pathname check** - redirects even if already on `/organizations/new`.

### Keycloak updateUserAndTokens (Lines 98-99)

```typescript
// Update user and tokens only, preserve organization data from localStorage
updateUserAndTokens(user, kc.token, kc.refreshToken || '');
```

**Comment indicates intent** to preserve org data, but if localStorage is empty (new user or cleared), org data will be null.

### authStore updateUserAndTokens (Lines 58-59)

```typescript
updateUserAndTokens: (user, accessToken, refreshToken) =>
  set({ user, accessToken, refreshToken }),
```

Only updates user + tokens, leaves `organizationId` and `organization` unchanged. If they were null, they stay null.

## Redirect Loop Sequence Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ User Action: Navigate to /login                                 │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ T1: Keycloak Init                                               │
│  - initialized = false → true                                    │
│  - authenticated = false → true (SSO session found)              │
│  - accessToken in authStore still null (not updated yet)        │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ T2: LoginForm useEffect #1                                      │
│  - hasHydrated=true, initialized=true                           │
│  - authenticated=true, accessToken=null                         │
│  - Condition fails (no accessToken) → No redirect               │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ T3: updateUserAndTokens called                                  │
│  - authStore.accessToken set to kc.token                        │
│  - authStore.organization remains null (no org data)            │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ T4: LoginForm useEffect #2 (triggered by accessToken change)   │
│  - hasHydrated=true, initialized=true                           │
│  - authenticated=true, accessToken=present                      │
│  - organization=null (no slug)                                  │
│  - Redirects to /organizations/new                              │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ T5: User on /organizations/new                                  │
│  - CreateOrganizationForm renders                               │
│  - No route guard prevents access                               │
│  - LoginForm still mounted (no layout boundary)                 │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ T6: If user navigates back or refreshes                         │
│  - pathname changes to /login or /organizations/new             │
│  - LoginForm useEffect runs again                               │
│  - Checks authenticated + accessToken + no org                  │
│  - Redirects to /organizations/new (loop repeats)               │
└─────────────────────────────────────────────────────────────────┘
```

## Proposed Fix

### Option 1: Mount OnboardingGuard (Recommended)

**Add guard to root layout:**

```typescript
// app/providers.tsx
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <QueryClientProvider client={queryClient}>
          <KeycloakProvider>
            <WebSocketProvider>
              <WebSocketEventSetup />
              <OnboardingGuard>  {/* ← ADD THIS */}
                {children}
              </OnboardingGuard>
            </WebSocketProvider>
          </KeycloakProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
```

**Why:** OnboardingGuard already has comprehensive logic including pathname checks to prevent redirect loops (lines 39-40, 54-55).

### Option 2: Fix LoginForm Redirect Logic

**Add pathname check:**

```typescript
// frontend/features/auth/components/LoginForm.tsx
import { useRouter, usePathname } from 'next/navigation';

export function LoginForm() {
  const router = useRouter();
  const pathname = usePathname();
  // ... other hooks

  useEffect(() => {
    if (!hasHydrated || !initialized) return;

    if (authenticated && accessToken) {
      // Don't redirect if already on target page
      if (pathname === '/organizations/new') return;

      if (organization?.slug) {
        const targetPath = `/organizations/${organization.slug}/conversations`;
        if (pathname !== targetPath) {
          router.replace(targetPath);
        }
      } else {
        router.replace('/organizations/new');
      }
    }
  }, [authenticated, accessToken, organization, hasHydrated, initialized, pathname, router]);
}
```

**Why:** Prevents useEffect from redirecting when already on target page.

### Option 3: Use Organizations List

**Check if user has orgs before sending to /new:**

```typescript
const organizations = useAuthStore((state) => state.organizations);

useEffect(() => {
  if (!hasHydrated || !initialized) return;

  if (authenticated && accessToken) {
    if (organization?.slug) {
      router.replace(`/organizations/${organization.slug}/conversations`);
    } else if (organizations && organizations.length > 0) {
      // User has orgs but no active selection - go to selector
      router.replace('/organizations');
    } else {
      // No orgs - create new
      router.replace('/organizations/new');
    }
  }
}, [authenticated, accessToken, organization, organizations, hasHydrated, initialized, router]);
```

**Why:** More accurate routing based on actual user state.

## Recommended Solution

**Combine all three fixes:**

1. **Mount OnboardingGuard** in root providers (centralized routing logic)
2. **Remove redirect logic from LoginForm** (guard handles it)
3. **Update OnboardingGuard** to check organizations list before redirecting to /new

**Modified OnboardingGuard (lines 52-59):**

```typescript
// Authenticated but no organization - redirect to onboarding
if (!hasOrganization) {
  if (!isOnboardingRoute) {
    // Check if user has orgs but no selection
    if (organizations && organizations.length > 0) {
      router.replace('/organizations');  // Selector page
    } else {
      router.replace('/organizations/new');  // Create new
    }
  }
  setIsChecking(false);
  return;
}
```

**Simplified LoginForm:**

```typescript
// Remove redirect useEffect entirely
// Just show login button
// Let OnboardingGuard handle all routing
```

## Supporting Evidence

### File: OnboardingGuard.tsx

**Lines 14-21: Route Definitions**
```typescript
const ONBOARDING_ROUTES = [
  '/create-organization',
  '/connect-platforms',
  '/invite-members',
  '/organizations/new',  // ← Recognized as onboarding route
];

const AUTH_ROUTES = ['/login', '/register', '/auth/callback'];
```

**Lines 39-40: Auth Route Check**
```typescript
const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));
const isOnboardingRoute = ONBOARDING_ROUTES.some((route) => pathname.startsWith(route));
```

**Lines 43-49: Prevents redirect loop on auth routes**
```typescript
if (!authenticated || !accessToken) {
  if (!isAuthRoute) {  // ← Only redirect if NOT on auth route
    router.replace('/login');
  }
  setIsChecking(false);
  return;
}
```

**Lines 52-58: Prevents redirect loop on onboarding routes**
```typescript
if (!hasOrganization) {
  if (!isOnboardingRoute) {  // ← Only redirect if NOT on onboarding route
    router.replace('/organizations/new');
  }
  setIsChecking(false);
  return;
}
```

This guard already has loop prevention logic - just needs to be mounted.

## Testing Recommendations

### Test Case 1: New User (No Orgs)

**Steps:**
1. Clear localStorage
2. Navigate to `/login`
3. Click "Sign in with SSO"
4. Complete Keycloak auth

**Expected:**
- Redirect to `/organizations/new`
- No further redirects
- CreateOrganizationForm renders

### Test Case 2: Existing User (Has Org, No Active Selection)

**Steps:**
1. Set localStorage: `organizations=[{id:1, slug:'test'}]`, `organization=null`
2. Navigate to `/login`
3. Complete auth

**Expected:**
- Redirect to `/organizations` (selector page)
- NOT to `/organizations/new`

### Test Case 3: Existing User (Has Active Org)

**Steps:**
1. Set localStorage: `organization={slug:'test'}`
2. Navigate to `/login`
3. Complete auth

**Expected:**
- Redirect to `/organizations/test/conversations`
- Dashboard loads

### Test Case 4: Unauthenticated User on Protected Route

**Steps:**
1. Clear Keycloak session
2. Navigate to `/organizations/new` directly

**Expected (with guard mounted):**
- Redirect to `/login`
- No access to protected route

## Performance Impact

**Current (broken):**
- Redirect loop causes ~10 redirects/sec until browser throttles
- Network tab shows repeated 307 responses
- High CPU usage from React re-renders

**After fix:**
- Single redirect per route change
- Guard blocks render until auth state resolved
- Loading spinner shown during check

## Security Implications

**Current vulnerability:**
- Unauthenticated users can access `/organizations/new` directly
- No guard prevents route access
- API calls may fail but UI renders

**After mounting OnboardingGuard:**
- All routes protected by auth check
- Unauthenticated requests redirect to login
- Authenticated users without orgs isolated to onboarding flow

## Unresolved Questions

1. **Why was OnboardingGuard never mounted?**
   - Git history shows OnboardingGuard created in commit `37cfcdb` (feat: onboarding flow)
   - Updated in commit `3b6c53e` (feat: URL-based org routing)
   - **Never imported or used in any layout file** - appears to be unfinished implementation
   - Component was written but integration step was skipped

2. **Should LoginForm have ANY redirect logic?**
   - Current pattern mixes concerns (UI + routing)
   - Better to centralize in guard

3. **Organizations selector page location?**
   - Currently at `/organizations` (org-selector layout)
   - Guard redirects there if user has orgs but no selection
   - Does this page exist and work correctly?

4. **localStorage persistence strategy:**
   - When does `organization` get cleared?
   - On logout only, or also on page refresh?
   - Is there a race between localStorage read and Keycloak init?
