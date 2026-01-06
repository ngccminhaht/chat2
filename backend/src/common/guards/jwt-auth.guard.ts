import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  CanActivate,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { KeycloakTokenService } from '@/modules/auth/services/keycloak-token.service';
import { UsersService } from '@/modules/users/users.service';

/**
 * JWT Auth Guard using KeycloakTokenService
 * Validates Keycloak JWT tokens using RS256 + JWKS
 * Auto-creates MongoDB user on first login
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Inject(KeycloakTokenService)
    private keycloakTokenService: KeycloakTokenService,
    @Inject(UsersService)
    private usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7);

    try {
      const payload = await this.keycloakTokenService.verifyToken(token);
      const keycloakId = payload.sub;
      const email = payload.email;
      const name = payload.name || payload.preferred_username || email;

      // Find or create user by Keycloak ID
      let user = await this.usersService.findByKeycloakId(keycloakId);

      if (!user) {
        // Check if user exists by email (may have been created before SSO)
        user = await this.usersService.findByEmail(email);

        if (user) {
          // Link existing user to Keycloak
          user = await this.usersService.update(user._id.toString(), {
            keycloakId,
            name,
          });
        } else {
          // Create new user
          user = await this.usersService.create({
            email,
            name,
            keycloakId,
            isActive: true,
          });
        }
      }

      // Attach MongoDB user info to request (with ObjectId)
      request.user = {
        sub: user._id.toString(), // MongoDB ObjectId as string
        keycloakId,
        email: user.email,
        name: user.name,
        roles: payload.realm_access?.roles || [],
        organizationId: payload.organizationId,
      };

      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
