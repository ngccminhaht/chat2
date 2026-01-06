import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Request user interface after KeycloakUserSyncGuard
 */
export interface RequestUser {
  sub: string; // Keycloak user ID
  email: string;
  name?: string;
  preferred_username?: string;
  mongoUserId: string; // MongoDB ObjectId as string
  dbUser: any; // Full MongoDB user document
  realm_access?: { roles: string[] };
}

/**
 * CurrentUser Decorator
 * Extracts the authenticated user from the request after Keycloak auth + MongoDB sync.
 *
 * Usage:
 * async myMethod(@CurrentUser() user: RequestUser) {}
 *
 * Or with specific property:
 * async myMethod(@CurrentUser('mongoUserId') userId: string) {}
 * async myMethod(@CurrentUser('sub') keycloakId: string) {}
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return undefined;
    }

    return data ? user[data] : user;
  },
);
