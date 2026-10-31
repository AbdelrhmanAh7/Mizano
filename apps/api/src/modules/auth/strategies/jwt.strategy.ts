import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthSessionsService } from '../auth-sessions.service';

interface JwtPayload {
  sub: string;
  sid?: string;
  email: string;
  name: string;
  organizationId: string;
  roleId: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    private sessions: AuthSessionsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    // A signed-out session (this device, or everywhere) stops its access tokens at once.
    const user = await this.sessions.activeUser(payload.sub, payload.sid);

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User not found or inactive');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      organizationId: user.organizationId,
      roleId: user.roleId,
      sessionId: payload.sid,
    };
  }
}
