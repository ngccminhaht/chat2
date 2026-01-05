# Keycloak Authentication

This application uses Keycloak as the **only** authentication method. There is no password-based authentication - all users must authenticate through Keycloak SSO.

## Architecture

```
Frontend (Next.js)           Backend (NestJS)           Keycloak Server
     |                            |                           |
     |-- 1. Redirect to Keycloak Login ------------------------>|
     |                            |                           |
     |<-- 2. Return with JWT token ----------------------------|
     |                            |                           |
     |-- 3. API Request + Authorization: Bearer <token> ----->|
     |                            |                           |
     |                            |-- 4. Validate token (JWKS)-->|
     |                            |<-- 5. Public key ---------|
     |                            |                           |
     |                            |-- 6. Fetch/sync user (lazy)|
     |                            |                           |
     |<-- 7. Return API response --|                          |
```

**Key Changes:**
- Frontend uses Keycloak token **directly** for all API calls
- No separate backend session tokens
- User data fetched/synced only when needed (lazy loading)

## Backend Configuration

### 1. Environment Variables

Add to `backend/.env`:

```bash
# Keycloak Configuration
KEYCLOAK_REALM=your-realm-name
KEYCLOAK_SERVER_URL=https://your-keycloak-server.com
KEYCLOAK_CLIENT_ID=your-client-id
KEYCLOAK_CLIENT_SECRET=your-client-secret  # Optional, for confidential clients
```

### 2. How It Works

1. **JWT Validation**: Backend validates Keycloak tokens using JWKS (JSON Web Key Set) on each request
2. **Lazy User Sync**: User data fetched/created in DB only when first accessed via protected endpoints
3. **No Session Tokens**: Frontend uses Keycloak token directly (no separate backend JWT)
4. **KeycloakAuthGuard**: Protects endpoints and extracts user info from Keycloak token claims

### 3. Protected Endpoints

Use `@UseGuards(KeycloakAuthGuard)` to protect endpoints:

```typescript
@Get('protected')
@UseGuards(KeycloakAuthGuard)
async protectedRoute(@CurrentUser() user: any) {
  // user.sub = Keycloak user ID
  // user.email, user.name = from token claims
  return { message: 'You are authenticated' };
}
```

### 4. Database Schema

User model is synced from Keycloak on each login:

```typescript
@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  email: string;  // From Keycloak token claim 'email'

  @Prop({ required: true })
  name: string;   // From Keycloak token claim 'name' or 'preferred_username'

  @Prop({ unique: true, sparse: true })
  keycloakId?: string;  // From Keycloak token claim 'sub' (subject)

  @Prop()
  avatarUrl?: string;  // Can be set from Keycloak profile or manually

  @Prop({ type: Object, default: {} })
  settings: UserSettings;

  @Prop({ default: true })
  isActive: boolean;
}
```

**Fields synced from Keycloak JWT token:**
- `keycloakId` ← `sub` (subject, unique user ID)
- `email` ← `email` claim
- `name` ← `name` or `preferred_username` claim
- `roles` ← `realm_access.roles` (used for authorization, not stored)
- `organizationId` ← custom `organizationId` claim (if configured)

## Frontend Configuration

### 1. Environment Variables

Add to `frontend/.env.local`:

```bash
NEXT_PUBLIC_KEYCLOAK_URL=https://your-keycloak-server.com
NEXT_PUBLIC_KEYCLOAK_REALM=your-realm-name
NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=your-client-id
```

### 2. Initialize Keycloak

In your app providers or layout:

```typescript
import { initKeycloak, loginWithKeycloak, getKeycloakToken } from '@/lib/keycloak/keycloak';

// Initialize on app load
useEffect(() => {
  initKeycloak().then(authenticated => {
    if (authenticated) {
      // User is logged in via Keycloak
      const token = getKeycloakToken();
      // Sync with backend
      syncKeycloakUser(token);
    }
  });
}, []);
```

### 3. Login Flow

```typescript
import { loginWithKeycloak, getKeycloakToken } from '@/lib/keycloak/keycloak';
import apiClient from '@/lib/api/client';

// 1. Trigger Keycloak login
const handleLogin = () => {
  loginWithKeycloak(); // Redirects to Keycloak
};

// 2. After redirect back, configure API client
const setupAfterLogin = () => {
  const keycloakToken = getKeycloakToken();

  // Set token in API client for all requests
  apiClient.defaults.headers.common['Authorization'] = `Bearer ${keycloakToken}`;

  // Now all API calls will include Keycloak token
  // User data will be fetched lazily when needed
};
```

### 4. Auto Token Refresh

Token automatically refreshes 30 seconds before expiry. No manual intervention needed.

### 5. Logout

```typescript
import { logoutFromKeycloak } from '@/lib/keycloak/keycloak';

const handleLogout = () => {
  logoutFromKeycloak(); // Redirects to Keycloak logout
};
```

## Keycloak Server Setup

### 1. Create Realm

1. Login to Keycloak admin console
2. Create new realm (e.g., "my-app")

### 2. Create Client

1. Go to Clients → Create
2. Client ID: `my-app-frontend`
3. Client Protocol: `openid-connect`
4. Access Type: `public` (for browser apps)
5. Valid Redirect URIs: `http://localhost:3001/*`
6. Web Origins: `http://localhost:3001`

### 3. Configure Client

**Settings:**
- Direct Access Grants: `ON` (for password grant)
- Implicit Flow: `OFF`
- Standard Flow: `ON` (for authorization code flow)

**Advanced Settings:**
- PKCE Code Challenge Method: `S256`

### 4. Create Users

1. Go to Users → Add user
2. Set username, email, first name, last name
3. Go to Credentials tab → Set password

### 5. Required Token Claims

Ensure the following scopes are enabled for your client:

**Required Scopes:**
- `openid` (always included)
- `email` (provides `email` and `email_verified` claims)
- `profile` (provides `name`, `preferred_username`, `given_name`, `family_name` claims)

**Standard Token Claims Used:**
- `sub`: Keycloak user ID (stored as `keycloakId`)
- `email`: User email address
- `name` or `preferred_username`: User display name
- `realm_access.roles`: User roles for authorization

**Optional Custom Claims:**
To add `organizationId` to token:
1. Go to Client Scopes → Create
2. Name: `organization`
3. Add Mapper:
   - Mapper Type: `User Attribute`
   - User Attribute: `organizationId`
   - Token Claim Name: `organizationId`
   - Claim JSON Type: `String`
4. Assign scope to your client

## Testing

### 1. Test Backend Validation

```bash
# Get token from Keycloak (for testing purposes)
curl -X POST "https://your-keycloak.com/realms/your-realm/protocol/openid-connect/token" \
  -d "client_id=your-client" \
  -d "username=user@example.com" \
  -d "password=password" \
  -d "grant_type=password"

# Use token with any protected endpoint
curl -X GET "http://localhost:3000/api/conversations" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 2. Test Frontend Login Flow

1. Start frontend: `cd frontend && yarn dev`
2. Application redirects to Keycloak login page
3. Enter Keycloak credentials
4. Redirected back with JWT token
5. Token saved and used for all API requests
6. User data fetched lazily on first protected endpoint access

## Troubleshooting

### Backend: "Invalid token"

- Check `KEYCLOAK_SERVER_URL` and `KEYCLOAK_REALM` are correct
- Verify JWKS endpoint: `https://your-keycloak.com/realms/your-realm/protocol/openid-connect/certs`
- Check token issuer matches: `https://your-keycloak.com/realms/your-realm`

### Frontend: "Failed to initialize"

- Check browser console for errors
- Verify `NEXT_PUBLIC_KEYCLOAK_*` env variables
- Check Keycloak client redirect URIs include your frontend URL

### "User already exists"

- User with same Keycloak ID already exists
- This should not happen as Keycloak `sub` claim is unique

### "Missing required fields in token"

- Check Keycloak client scopes include `email` and `profile` scopes
- Verify token contains `email`, `name`, and `sub` claims

## Security Best Practices

1. **HTTPS in Production**: Always use HTTPS for Keycloak and app
2. **PKCE Flow**: Enabled by default in frontend config (S256 challenge method)
3. **Token Expiry**: Tokens auto-refresh 30 seconds before expiry
4. **CORS**: Configure proper CORS in both Keycloak and backend
5. **Client Secret**: For confidential clients, store secret in backend env only
6. **Token Validation**: Backend validates tokens using JWKS (no token introspection needed)

## References

- [Keycloak Documentation](https://www.keycloak.org/documentation)
- [Keycloak JS Adapter](https://www.keycloak.org/docs/latest/securing_apps/#_javascript_adapter)
- [NestJS Passport](https://docs.nestjs.com/security/authentication)
- [JWKS RFC](https://datatracker.ietf.org/doc/html/rfc7517)
