import { Injectable } from '@nestjs/common';
import {
  KeycloakConnectOptions,
  KeycloakConnectOptionsFactory,
  PolicyEnforcementMode,
  TokenValidation,
} from 'nest-keycloak-connect';
import { EnvService } from '../env';

@Injectable()
export class KeycloakConfigService implements KeycloakConnectOptionsFactory {
  constructor(private readonly envService: EnvService) {}

  createKeycloakConnectOptions(): KeycloakConnectOptions {
    const secret = this.envService.get('KEYCLOAK_CLIENT_SECRET');

    return {
      authServerUrl: this.envService.get('KEYCLOAK_SERVER_URL'),
      realm: this.envService.get('KEYCLOAK_REALM'),
      clientId: this.envService.get('KEYCLOAK_CLIENT_ID'),
      // Only set secret if provided (public clients don't have secrets)
      ...(secret && { secret }),
      // PERMISSIVE: Allow requests without @Roles/@Scopes to pass through
      policyEnforcement: PolicyEnforcementMode.PERMISSIVE,
      // OFFLINE: Validate JWT locally using Keycloak's public key (works with public clients)
      tokenValidation: TokenValidation.OFFLINE,
    };
  }
}
