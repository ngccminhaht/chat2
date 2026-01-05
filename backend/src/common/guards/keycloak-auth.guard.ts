import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Keycloak Authentication Guard
 * Uses KeycloakStrategy to validate JWT tokens from Keycloak
 *
 * Usage:
 * @UseGuards(KeycloakAuthGuard)
 * async someEndpoint(@CurrentUser() user: KeycloakUser) { ... }
 */
@Injectable()
export class KeycloakAuthGuard extends AuthGuard('keycloak') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }
}
