import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * CurrentOrganization Decorator
 * Extracts the active organization ID from the request
 *
 * Requires TenantGuard to be applied first
 *
 * Usage:
 * @UseGuards(JwtAuthGuard, TenantGuard)
 * async myMethod(@CurrentOrganization() organizationId: string) {}
 */
export const CurrentOrganization = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.organizationId;
  },
);
