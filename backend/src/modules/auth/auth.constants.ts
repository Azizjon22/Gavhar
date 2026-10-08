import { sha256Hex } from '@/common/crypto/token.util';

export const REFRESH_COOKIE = 'gavhar_rt';
export const CSRF_COOKIE = 'gavhar_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/** Refresh cookie faqat auth endpointlariga yuboriladi. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export const JWT_ISSUER = 'gavhar-api';
export const JWT_AUDIENCE = 'gavhar-web';

export const AUTH_CONTEXT_TTL_SECONDS = 60;
export const TWO_FACTOR_CHALLENGE_TTL_SECONDS = 5 * 60;
export const TWO_FACTOR_CHALLENGE_MAX_ATTEMPTS = 5;
export const TOTP_REPLAY_TTL_SECONDS = 90;
export const BACKUP_CODE_COUNT = 10;

export const redisKeys = {
  authContext: (userId: string) => `auth:user:${userId}`,
  revokedSession: (sessionId: string) => `auth:revoked-session:${sessionId}`,
  loginFailures: (email: string) => `auth:login:fail:${sha256Hex(email)}`,
  loginLock: (email: string) => `auth:login:lock:${sha256Hex(email)}`,
  loginLockLevel: (email: string) => `auth:login:level:${sha256Hex(email)}`,
  twoFactorChallenge: (token: string) => `auth:2fa:challenge:${sha256Hex(token)}`,
  totpUsed: (userId: string, code: string) => `auth:2fa:used:${userId}:${code}`,
} as const;
