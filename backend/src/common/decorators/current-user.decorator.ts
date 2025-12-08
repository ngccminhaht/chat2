import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * CurrentUser Decorator
 * Extracts the authenticated user from the request
 *
 * Usage:
 * @UseGuards(JwtAuthGuard)
 * async myMethod(@CurrentUser() user: { sub: string }) {}
 *
 * Or with specific property:
 * async myMethod(@CurrentUser('sub') userId: string) {}
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
