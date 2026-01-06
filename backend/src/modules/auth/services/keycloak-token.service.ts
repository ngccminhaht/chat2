import { Injectable, Logger } from '@nestjs/common';
import { EnvService } from '@/common/env';
import * as jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

/**
 * Service to validate Keycloak JWT tokens using JWKS
 * Used by WebSocket gateway and other services that need to validate tokens
 */
@Injectable()
export class KeycloakTokenService {
  private readonly logger = new Logger(KeycloakTokenService.name);
  private readonly client: jwksClient.JwksClient;
  private readonly issuer: string;

  constructor(private readonly envService: EnvService) {
    const keycloakServerUrl = envService.get('KEYCLOAK_SERVER_URL');
    const keycloakRealm = envService.get('KEYCLOAK_REALM');

    if (!keycloakServerUrl || !keycloakRealm) {
      throw new Error('Keycloak configuration missing');
    }

    const jwksUri = `${keycloakServerUrl}/realms/${keycloakRealm}/protocol/openid-connect/certs`;
    this.issuer = `${keycloakServerUrl}/realms/${keycloakRealm}`;

    this.client = jwksClient({
      jwksUri,
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
  }

  private getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
    this.client.getSigningKey(header.kid, (err, key) => {
      if (err) {
        callback(err);
        return;
      }
      const signingKey = key?.getPublicKey();
      callback(null, signingKey);
    });
  }

  async verifyToken(token: string): Promise<any> {
    return new Promise((resolve, reject) => {
      jwt.verify(
        token,
        this.getKey.bind(this),
        {
          algorithms: ['RS256'],
          issuer: this.issuer,
        },
        (err, decoded) => {
          if (err) {
            this.logger.error(`Token verification failed: ${err.message}`);
            reject(err);
            return;
          }
          resolve(decoded);
        },
      );
    });
  }
}
