import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UsersService } from '@/modules/users/users.service';

// Matches the META_PUBLIC constant from nest-keycloak-connect
const META_PUBLIC = 'public';

/**
 * Guard that syncs Keycloak user to MongoDB after nest-keycloak-connect AuthGuard.
 * Runs after AuthGuard to ensure token is already validated.
 * Creates/links MongoDB user and attaches to request.
 */
@Injectable()
export class KeycloakUserSyncGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Inject(UsersService)
    private usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is public (skip user sync for public routes)
    const isPublic = this.reflector.getAllAndOverride<boolean>(META_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const keycloakUser = request.user;

    // If no keycloak user, AuthGuard already handled it
    if (!keycloakUser || !keycloakUser.sub) {
      return true;
    }

    const keycloakId = keycloakUser.sub;
    const email = keycloakUser.email;
    const name =
      keycloakUser.name ||
      keycloakUser.preferred_username ||
      keycloakUser.email;

    // Find or create MongoDB user
    let dbUser = await this.usersService.findByKeycloakId(keycloakId);

    if (!dbUser) {
      // Check if user exists by email (may have been created before SSO)
      dbUser = await this.usersService.findByEmail(email);

      if (dbUser) {
        // Link existing user to Keycloak
        dbUser = await this.usersService.update(dbUser._id.toString(), {
          keycloakId,
          name,
        });
      } else {
        // Create new user
        dbUser = await this.usersService.create({
          email,
          name,
          keycloakId,
          isActive: true,
        });
      }
    }

    // Extend request.user with MongoDB user info
    // Override sub with MongoDB ObjectId for backward compatibility with existing controllers
    request.user = {
      ...keycloakUser,
      sub: dbUser._id.toString(), // MongoDB ObjectId - used by existing code
      keycloakId, // Original Keycloak ID
      mongoUserId: dbUser._id.toString(),
      email: dbUser.email,
      name: dbUser.name,
      dbUser,
    };

    return true;
  }
}
