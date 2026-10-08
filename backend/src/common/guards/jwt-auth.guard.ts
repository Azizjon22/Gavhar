import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserStatus } from '@prisma/client';
import { Request } from 'express';
import { setRequestActor } from '@/common/context/request-context';
import { ALLOW_RESTRICTED_KEY } from '@/common/decorators/allow-restricted.decorator';
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';
import { AppException } from '@/common/errors/app.exception';
import { SYSTEM_ROLES } from '@/common/permissions/permission-catalog';
import { AuthUser } from '@/common/types/auth-user';
import { AppConfigService } from '@/config/app-config.service';
import { AuthContextService } from '@/modules/auth/services/auth-context.service';
import { SessionsService } from '@/modules/auth/services/sessions.service';
import { TokenService } from '@/modules/auth/services/token.service';

const BEARER = /^Bearer\s+(\S+)$/i;

/**
 * Global guard: `@Public()` bo'lmagan har bir endpoint yaroqli access token,
 * bekor qilinmagan sessiya va faol foydalanuvchini talab qiladi.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly sessions: SessionsService,
    private readonly authContext: AuthContextService,
    private readonly config: AppConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
    if (!token) {
      throw AppException.unauthorized('UNAUTHENTICATED', 'Tizimga kirish talab qilinadi');
    }

    const payload = await this.tokens.verifyAccessToken(token);
    if (await this.sessions.isRevoked(payload.sid)) {
      throw AppException.unauthorized('SESSION_REVOKED', 'Sessiya bekor qilingan');
    }

    const cached = await this.authContext.load(payload.sub);
    if (!cached || cached.status !== UserStatus.ACTIVE) {
      throw AppException.unauthorized('ACCOUNT_UNAVAILABLE', 'Hisob faol emas');
    }

    const { status: _status, ...profile } = cached;
    const user: AuthUser = { ...profile, sessionId: payload.sid };
    request.user = user;
    setRequestActor({ id: user.id, email: user.email });

    if (!this.reflector.getAllAndOverride<boolean>(ALLOW_RESTRICTED_KEY, targets)) {
      this.assertUnrestricted(user);
    }
    return true;
  }

  private assertUnrestricted(user: AuthUser): void {
    if (user.mustChangePassword) {
      throw AppException.forbidden(
        'PASSWORD_CHANGE_REQUIRED',
        "Davom etish uchun parolni o'zgartiring",
      );
    }
    if (
      this.config.auth.superAdminTwoFactorRequired &&
      user.roleKey === SYSTEM_ROLES.SUPER_ADMIN &&
      !user.twoFactorEnabled
    ) {
      throw AppException.forbidden(
        'TWO_FACTOR_SETUP_REQUIRED',
        'SUPER_ADMIN uchun ikki bosqichli himoyani ulash majburiy',
      );
    }
  }
}
