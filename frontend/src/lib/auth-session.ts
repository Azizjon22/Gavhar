import axios from 'axios';
import type { AuthProfile, AuthSession } from '@/features/auth/types/auth.types';
import { toApiError } from '@/lib/api-error';
import { env } from '@/lib/env';
import { useAuthStore } from '@/stores/auth.store';
import type { ApiSuccess } from '@/types/api';

/**
 * Sessiya hayot sikli: yuklash, yangilash, tugatish.
 *
 * Bu yerda interceptorsiz "xom" axios ishlatiladi — asosiy `api` klienti shu
 * modulga tayanadi, aylanma bog'liqlik bo'lmasligi kerak.
 */
const raw = axios.create({
  baseURL: env.apiUrl,
  withCredentials: true,
  timeout: 15_000,
  headers: { Accept: 'application/json' },
});

const REFRESH_LOCK = 'gavhar:auth-refresh';
const AUTH_CHANNEL = 'gavhar:auth';

type AuthBroadcast = { type: 'logout' };

const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(AUTH_CHANNEL);

if (channel) {
  // Bir tabda chiqilsa, qolgan tablar ham darhol chiqadi.
  channel.onmessage = (event: MessageEvent<AuthBroadcast>) => {
    if (event.data.type === 'logout') useAuthStore.getState().clear();
  };
}

/**
 * Refresh token har ishlatilganda almashadi, shuning uchun ikki tab bir vaqtda
 * yangilasa, ikkinchisi "ishlatilgan token" yuborib, server barcha sessiyalarni
 * bekor qilardi. Web Locks tablar orasida navbat hosil qiladi.
 */
function withCrossTabLock<T>(task: () => Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || !('locks' in navigator)) return task();

  return new Promise<T>((resolve, reject) => {
    // Qulf `task` tugaguncha ushlab turiladi (callback qaytargan promise bo'yicha).
    void navigator.locks.request(REFRESH_LOCK, () => task().then(resolve, reject));
  });
}

async function fetchCsrfToken(): Promise<string> {
  const response = await raw.get<ApiSuccess<{ csrfToken: string }>>('/auth/csrf');
  return response.data.data.csrfToken;
}

let refreshInFlight: Promise<AuthSession> | null = null;

/** Bir tab ichida bir vaqtda faqat bitta refresh so'rovi (single-flight). */
export function refreshSession(): Promise<AuthSession> {
  refreshInFlight ??= withCrossTabLock(async () => {
    const csrfToken = await fetchCsrfToken();
    const response = await raw.post<ApiSuccess<AuthSession>>('/auth/refresh', undefined, {
      headers: { 'X-CSRF-Token': csrfToken },
    });
    const session = response.data.data;
    useAuthStore.getState().setSession(session);
    return session;
  }).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

let bootstrapPromise: Promise<void> | null = null;

/** Ilova ochilganda: cookie'dagi refresh token bilan sessiyani tiklashga urinadi. */
export function bootstrapSession(): Promise<void> {
  bootstrapPromise ??= refreshSession().then(
    () => undefined,
    () => useAuthStore.getState().clear(),
  );
  return bootstrapPromise;
}

/** Profil serverda o'zgargan bo'lishi mumkin (rol, cheklovlar) — qayta o'qiydi. */
export async function syncProfile(): Promise<AuthProfile | null> {
  const { accessToken, setUser } = useAuthStore.getState();
  if (!accessToken) return null;

  const response = await raw.get<ApiSuccess<AuthProfile>>('/auth/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  setUser(response.data.data);
  return response.data.data;
}

/** Mahalliy sessiyani tugatadi (server chaqirilmaydi) va boshqa tablarga xabar beradi. */
export function endLocalSession(): void {
  useAuthStore.getState().clear();
  channel?.postMessage({ type: 'logout' } satisfies AuthBroadcast);
}

export async function logoutSession(): Promise<void> {
  try {
    const csrfToken = await fetchCsrfToken();
    await raw.post('/auth/logout', undefined, { headers: { 'X-CSRF-Token': csrfToken } });
  } catch (error) {
    // Server javob bermasa ham foydalanuvchi mahalliy chiqariladi;
    // sessiya serverda muddati tugaguncha qoladi.
    console.warn('Logout so‘rovi bajarilmadi:', toApiError(error).code);
  } finally {
    endLocalSession();
  }
}
