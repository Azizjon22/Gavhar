import i18n from '@/i18n';
import { type ApiError, toApiError } from '@/lib/api-error';

/** 75 → "1 daqiqa 15 soniya" (joriy tilda). */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  const parts: string[] = [];
  if (minutes > 0) parts.push(i18n.t('common.duration.minutes', { count: minutes }));
  if (rest > 0 || minutes === 0) parts.push(i18n.t('common.duration.seconds', { count: rest }));
  return parts.join(' ');
}

/**
 * Xatoni foydalanuvchi tilidagi xabarga aylantiradi. Tarjima `errors.codes.<KOD>`
 * dan olinadi; noma'lum kod uchun serverning o'z xabari ko'rsatiladi.
 */
export function errorMessage(error: unknown): string {
  const apiError: ApiError = toApiError(error);
  const key = `errors.codes.${apiError.code}`;

  if (i18n.exists(key)) {
    const details =
      typeof apiError.details === 'object' && apiError.details !== null
        ? (apiError.details as Record<string, unknown>)
        : {};
    return i18n.t(key, { ...details, time: formatDuration(apiError.retryAfterSeconds ?? 0) });
  }
  return apiError.message || i18n.t('errors.codes.UNKNOWN');
}
