import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { safeEqual } from '@/common/crypto/token.util';
import { AppException } from '@/common/errors/app.exception';
import { CSRF_COOKIE, CSRF_HEADER } from '@/modules/auth/auth.constants';

/**
 * Double-submit CSRF tekshiruvi. Faqat cookie orqali autentifikatsiya
 * qilinadigan endpointlarga (refresh, logout) kerak — qolganlari
 * `Authorization` sarlavhasidan foydalanadi va CSRF'ga uchramaydi.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const cookie: unknown = (request.cookies as Record<string, unknown> | undefined)?.[CSRF_COOKIE];
    const header = request.headers[CSRF_HEADER];

    if (
      typeof cookie !== 'string' ||
      typeof header !== 'string' ||
      cookie.length === 0 ||
      !safeEqual(cookie, header)
    ) {
      throw AppException.forbidden('CSRF_TOKEN_INVALID', "CSRF tokeni noto'g'ri yoki yo'q");
    }
    return true;
  }
}
