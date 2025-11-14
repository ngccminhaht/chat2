import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err, user, info) {
    if (err || !user) {
      console.error('JWT Auth Guard - Error:', err);
      console.error('JWT Auth Guard - Info:', info);
      console.error('JWT Auth Guard - User:', user);
      throw err || new UnauthorizedException('Unauthorized');
    }
    return user;
  }
}
