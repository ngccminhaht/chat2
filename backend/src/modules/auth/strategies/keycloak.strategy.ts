import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { EnvService } from '@/common/env';

/**
 * Keycloak JWT Strategy
 * Validates JWT tokens issued by Keycloak using public key from JWKS endpoint
 *
 * Flow:
 * 1. Frontend gets token from Keycloak
 * 2. Frontend sends token in Authorization header
 * 3. This strategy validates token signature using Keycloak's public key
 * 4. Extract user info from token claims
 */
@Injectable()
export class KeycloakStrategy extends PassportStrategy(Strategy, 'keycloak') {
  constructor(private readonly envService: EnvService) {
    const keycloakServerUrl = envService.get('KEYCLOAK_SERVER_URL');
    const keycloakRealm = envService.get('KEYCLOAK_REALM');

    if (!keycloakServerUrl || !keycloakRealm) {
      throw new Error('Keycloak configuration missing: KEYCLOAK_SERVER_URL and KEYCLOAK_REALM are required');
    }

    const jwksUri = `${keycloakServerUrl}/realms/${keycloakRealm}/protocol/openid-connect/certs`;

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri,
      }),
      issuer: `${keycloakServerUrl}/realms/${keycloakRealm}`,
      algorithms: ['RS256'],
    });
  }

  async validate(payload: any) {
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }

    // Extract user info from Keycloak token claims
    return {
      sub: payload.sub, // Keycloak user ID
      email: payload.email,
      name: payload.name || payload.preferred_username,
      roles: payload.realm_access?.roles || [],
      organizationId: payload.organizationId, // Custom claim if configured
    };
  }
}
