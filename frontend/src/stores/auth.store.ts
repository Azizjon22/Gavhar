import { create } from 'zustand';
import type { AuthProfile } from '@/features/auth/types/auth.types';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  /** Access token faqat xotirada turadi — localStorage'ga yozilmaydi (XSS'dan himoya). */
  accessToken: string | null;
  user: AuthProfile | null;
  setSession: (session: { accessToken: string; user: AuthProfile }) => void;
  setUser: (user: AuthProfile) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  accessToken: null,
  user: null,
  setSession: ({ accessToken, user }) => set({ status: 'authenticated', accessToken, user }),
  setUser: (user) => set({ user }),
  clear: () => set({ status: 'unauthenticated', accessToken: null, user: null }),
}));

export const SUPER_ADMIN_ROLE = 'SUPER_ADMIN';

export const isSuperAdmin = (user: AuthProfile | null): boolean =>
  user?.role.key === SUPER_ADMIN_ROLE;

/** Sanab o'tilgan BARCHA ruxsatlar bo'lsa `true`. SUPER_ADMIN har doim o'tadi. */
export const hasPermissions = (user: AuthProfile | null, ...required: string[]): boolean => {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  return required.every((permission) => user.permissions.includes(permission));
};
