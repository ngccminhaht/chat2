import {
  Controller,
  Post,
  Body,
  UseGuards,
  UnauthorizedException,
  Get,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from './dto';
import { JwtAuthGuard, KeycloakAuthGuard } from '@/common/guards';
import { CurrentUser } from '@/common/decorators';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    const user = await this.authService.validateUser(
      loginDto.email,
      loginDto.password,
    );
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.authService.login(user);
  }

  /**
   * Keycloak login endpoint
   * Frontend sends Keycloak token, backend validates and syncs user
   * GET /api/auth/keycloak/me
   */
  @Get('keycloak/me')
  @UseGuards(KeycloakAuthGuard)
  async keycloakLogin(@CurrentUser() keycloakUser: any) {
    return this.authService.loginWithKeycloak(keycloakUser);
  }

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

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
