import {
  Controller,
  Post,
  Body,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from '@/common/decorators';
import { CurrentUser } from '@/common/decorators';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('refresh')
  @Public()
  async refresh(@Body() body: { refreshToken: string }) {
    return this.authService.refreshToken(body.refreshToken);
  }

  /**
   * Switch active organization
   * POST /api/auth/switch-organization
   */
  @Post('switch-organization')
  async switchOrganization(
    @CurrentUser() user: { sub: string },
    @Body() body: { organizationId: string },
  ) {
    return this.authService.switchOrganization(user.sub, body.organizationId);
  }
}
