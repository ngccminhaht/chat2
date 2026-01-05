import { Injectable, UnauthorizedException, Inject, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { EnvService } from '@/common/env';
import { UsersService } from '../users/users.service';
import { OrganizationsService } from '../organizations/organizations.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    @Inject(forwardRef(() => OrganizationsService))
    private organizationsService: OrganizationsService,
    private jwtService: JwtService,
    private envService: EnvService,
  ) {}


  /**
   * Generate tokens for user
   * @param user - User object
   * @param organizationId - Optional active organization ID
   */
  async login(user: any, organizationId?: string) {
    // Get user's organizations
    const userOrgs = await this.organizationsService.findByUser(
      user._id.toString(),
    );

    // Determine active organization
    let activeOrgId = organizationId;
    let activeOrg = null;

    if (userOrgs.length > 0) {
      // If no org specified, use first one
      if (!activeOrgId) {
        activeOrgId = userOrgs[0].organization._id.toString();
        activeOrg = userOrgs[0].organization;
      } else {
        // Verify user belongs to specified org
        const membership = userOrgs.find(
          (o) => o.organization._id.toString() === activeOrgId,
        );
        if (membership) {
          activeOrg = membership.organization;
        }
      }
    }

    const payload = {
      email: user.email,
      sub: user._id.toString(),
      organizationId: activeOrgId,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken: this.jwtService.sign(payload, {
        secret: this.envService.get('JWT_REFRESH_SECRET'),
        expiresIn: this.envService.get('JWT_REFRESH_EXPIRES_IN') || '7d',
      }),
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
      organization: activeOrg
        ? {
            id: activeOrg._id.toString(),
            name: activeOrg.name,
            slug: activeOrg.slug,
            plan: activeOrg.plan || 'free',
          }
        : null,
      organizationId: activeOrgId,
      organizations: userOrgs.map((o) => ({
        id: o.organization._id.toString(),
        name: o.organization.name,
        slug: o.organization.slug,
        role: o.role,
      })),
    };
  }

  /**
   * Switch active organization
   */
  async switchOrganization(userId: string, organizationId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Verify user belongs to org
    const role = await this.organizationsService.getUserRole(
      organizationId,
      userId,
    );
    if (!role) {
      throw new UnauthorizedException('Not a member of this organization');
    }

    return this.login(user.toObject(), organizationId);
  }


  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.envService.get('JWT_REFRESH_SECRET'),
      });

      const user = await this.usersService.findById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Preserve active organization from refresh token
      return this.login(user.toObject(), payload.organizationId);
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

}
