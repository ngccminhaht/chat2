import {
  Controller,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '@/common/guards';
import { CurrentUser } from '@/common/decorators';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('refresh')
  async refresh(@Body() body: { refreshToken: string }) {
    return this.authService.refreshToken(body.refreshToken);
  }

  /**
   * Switch active organization
   * POST /api/auth/switch-organization
   */
  @Post('switch-organization')
  @UseGuards(JwtAuthGuard)
  async switchOrganization(
    @CurrentUser() user: { sub: string },
    @Body() body: { organizationId: string },
  ) {
    return this.authService.switchOrganization(user.sub, body.organizationId);
  }
}
