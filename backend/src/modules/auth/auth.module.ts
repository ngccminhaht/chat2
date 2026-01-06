import { Module, forwardRef, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { EnvService } from '@/common/env';
import { UsersModule } from '../users/users.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { KeycloakStrategy } from './strategies/keycloak.strategy';
import { KeycloakTokenService } from './services/keycloak-token.service';

@Global()
@Module({
  imports: [
    UsersModule,
    forwardRef(() => OrganizationsModule),
    PassportModule,
    JwtModule.registerAsync({
      inject: [EnvService],
      useFactory: (envService: EnvService) => ({
        secret: envService.get('JWT_SECRET'),
        signOptions: { expiresIn: envService.get('JWT_EXPIRES_IN') || '15m' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, KeycloakStrategy, KeycloakTokenService],
  exports: [AuthService, KeycloakTokenService],
})
export class AuthModule {}
