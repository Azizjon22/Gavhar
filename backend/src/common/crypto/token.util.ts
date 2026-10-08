import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** URL uchun xavfsiz, kriptografik tasodifiy token. */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

export const sha256Hex = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

export const hmacSha256Hex = (key: string, value: string): string =>
  createHmac('sha256', key).update(value).digest('hex');

/** Vaqt bo'yicha hujumga chidamli taqqoslash. */
export const safeEqual = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
