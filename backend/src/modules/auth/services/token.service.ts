import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppException } from '@/common/errors/app.exception';
import { AppConfigService } from '@/config/app-config.service';
import { JWT_AUDIENCE, JWT_ISSUER } from '../auth.constants';

export interface AccessTokenPayload {
  /** Foydalanuvchi ID. */
  sub: string;
  /** Sessiya ID — sessiya bekor qilinsa token ham darhol yaroqsiz bo'ladi. */
  sid: string;
}

const isPayload = (value: unknown): value is AccessTokenPayload =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as AccessTokenPayload).sub === 'string' &&
  typeof (value as AccessTokenPayload).sid === 'string';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  get accessTtlSeconds(): number {
    return this.config.auth.accessTtlSeconds;
  }

  signAccessToken(payload: AccessTokenPayload): Promise<string> {
    return this.jwt.signAsync(
      { sub: payload.sub, sid: payload.sid },
      {
        secret: this.config.auth.accessSecret,
        algorithm: 'HS256',
        expiresIn: this.accessTtlSeconds,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      },
    );
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    let payload: unknown;
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.config.auth.accessSecret,
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
    } catch (error) {
      const expired = error instanceof Error && error.name === 'TokenExpiredError';
      throw expired
        ? AppException.unauthorized('ACCESS_TOKEN_EXPIRED', 'Token muddati tugagan')
        : AppException.unauthorized('INVALID_ACCESS_TOKEN', 'Token yaroqsiz');
    }

    if (!isPayload(payload)) {
      throw AppException.unauthorized('INVALID_ACCESS_TOKEN', 'Token yaroqsiz');
    }
    return { sub: payload.sub, sid: payload.sid };
  }
}
