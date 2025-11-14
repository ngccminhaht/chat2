import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'default-secret',
    });
    console.log('JwtStrategy initialized with secret:', configService.get<string>('JWT_SECRET'));
  }

  async validate(payload: any) {
    console.log('JwtStrategy.validate called with payload:', payload);
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }
}
