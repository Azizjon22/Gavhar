import type { AuthSession } from '@/features/auth/types/auth.types';
import { http } from '@/lib/api-client';

export interface TelegramStatus {
  /** Serverda bot tokeni sozlanganmi. */
  enabled: boolean;
  botUsername: string | null;
  linked: boolean;
  linkedAt: string | null;
}

export const telegramApi = {
  status: () => http.get<TelegramStatus>('/telegram/status'),
  /** Bir martalik `t.me/<bot>?start=<token>` havolasi (15 daqiqa). */
  createLink: () => http.post<{ url: string; expiresAt: string }>('/telegram/link'),
  unlink: () => http.delete('/telegram/link'),
  /** Mini App ichida: Telegram imzolagan initData bilan kirish. */
  login: (initData: string) => http.post<AuthSession>('/auth/telegram', { initData }),
};

export const telegramKeys = { status: ['telegram', 'status'] as const };
