import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { EnvService } from '@/common/env';

// JWT payload structure
export interface JwtPayload {
  sub: string; // userId
  email: string;
  organizationId?: string; // active organization (optional for backwards compat)
}

// Request user after validation
export interface RequestUser {
  sub: string; // userId (keep 'sub' for consistency with JWT standard)
  email: string;
  organizationId?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private envService: EnvService) {
    super({
      ignoreExpiration: false,
      secretOrKey: envService.get('JWT_SECRET'),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    return {
      sub: payload.sub,
      email: payload.email,
      organizationId: payload.organizationId,
    };
  }
}
