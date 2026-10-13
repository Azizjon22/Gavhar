import { useQuery } from '@tanstack/react-query';
import { http } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import type { AuthSession } from '../types/auth.types';

export interface DevLoginRole {
  id: string;
  key: string;
  name: string;
}

export interface DevLoginOptions {
  enabled: boolean;
  roles: DevLoginRole[];
}

const DISABLED: DevLoginOptions = { enabled: false, roles: [] };

export const devLoginApi = {
  options: () => http.get<DevLoginOptions>('/auth/dev-login'),
  enter: (roleId: string) => http.post<AuthSession>('/auth/dev-login', { roleId }),
};

export const devLoginKeys = { options: ['auth', 'dev-login'] as const };

/**
 * Tezkor kirish (ishlab chiqish rejimi): server `DEV_LOGIN_ENABLED=true` bilan
 * ishlayotgan bo'lsa, rollar ro'yxatini qaytaradi. Aks holda — o'chirilgan.
 */
export function useDevLogin(): DevLoginOptions {
  const query = useQuery({
    queryKey: devLoginKeys.options,
    queryFn: devLoginApi.options,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return query.data ?? DISABLED;
}

/** Kirish sahifasidan: tanlangan rol bilan sessiya ochadi (router ichkariga o'tkazadi). */
export async function enterAsRole(roleId: string): Promise<void> {
  useAuthStore.getState().setSession(await devLoginApi.enter(roleId));
}

/**
 * Tizim ichidan rolni almashtirish. Yangi sessiya cookie'ga yozilgach sahifa to'liq
 * qayta yuklanadi — oldingi rol uchun yuklangan ma'lumot xotirada qolib ketmaydi.
 */
export async function switchRole(roleId: string): Promise<void> {
  await devLoginApi.enter(roleId);
  window.location.assign('/');
}
