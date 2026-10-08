import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit:options';

export interface RateLimitOptions {
  /** Hisoblagich nomi — har bir endpoint guruhi uchun alohida. */
  name: string;
  limit: number;
  windowSeconds: number;
}

/** IP bo'yicha so'rovlar chegarasi. `RateLimitGuard` bilan birga ishlatiladi. */
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);
