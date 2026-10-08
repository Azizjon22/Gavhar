import { Injectable } from '@nestjs/common';
import { CookieOptions, Request, Response } from 'express';
import { randomToken } from '@/common/crypto/token.util';
import { AppConfigService } from '@/config/app-config.service';
import { CSRF_COOKIE, REFRESH_COOKIE, REFRESH_COOKIE_PATH } from '../auth.constants';

/** `randomToken(32)` natijasi: 43 ta base64url belgi. */
const CSRF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

@Injectable()
export class AuthCookieService {
  constructor(private readonly config: AppConfigService) {}

  private get base(): CookieOptions {
    return { secure: this.config.auth.cookieSecure, sameSite: 'strict' };
  }

  readRefreshToken(req: Request): string | undefined {
    const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  setRefreshToken(res: Response, token: string, expiresAt: Date): void {
    res.cookie(REFRESH_COOKIE, token, {
      ...this.base,
      httpOnly: true,
      path: REFRESH_COOKIE_PATH,
      expires: expiresAt,
    });
  }

  /**
   * Double-submit CSRF tokeni: JS o'qiy oladigan cookie + javob tanasi.
   * Frontend uni `X-CSRF-Token` sarlavhasida qaytaradi.
   *
   * Mavjud token qayta ishlatiladi (faqat muddati uzaytiriladi): aks holda
   * bir tab yangi token olganda boshqa ochiq tablardagi token eskirib qolardi.
   */
  issueCsrfToken(req: Request, res: Response): string {
    const existing: unknown = (req.cookies as Record<string, unknown> | undefined)?.[CSRF_COOKIE];
    const token =
      typeof existing === 'string' && CSRF_TOKEN_PATTERN.test(existing)
        ? existing
        : randomToken(32);

    res.cookie(CSRF_COOKIE, token, {
      ...this.base,
      httpOnly: false,
      path: '/',
      maxAge: this.config.auth.refreshTtlSeconds * 1000,
    });
    return token;
  }

  clear(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, { ...this.base, httpOnly: true, path: REFRESH_COOKIE_PATH });
    res.clearCookie(CSRF_COOKIE, { ...this.base, httpOnly: false, path: '/' });
  }
}
