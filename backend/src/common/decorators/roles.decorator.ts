import { SetMetadata } from '@nestjs/common';
import { OrganizationRole } from '@/common/database/schemas';
import { ROLES_KEY } from '@/common/guards/tenant.guard';

/**
 * Roles decorator - Specify required organization roles for a route
 *
 * Usage:
 * @Roles(OrganizationRole.ADMIN, OrganizationRole.OWNER)
 * async myAdminMethod() {}
 */
export const Roles = (...roles: OrganizationRole[]) =>
  SetMetadata(ROLES_KEY, roles);
