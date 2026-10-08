import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { FullPageLoader } from '@/components/shared/FullPageLoader';
import { ForbiddenPage } from '@/components/shared/StatusPages';
import type { AuthProfile } from '@/features/auth/types/auth.types';
import { hasPermissions, isSuperAdmin, useAuthStore } from '@/stores/auth.store';
import { ROUTES } from './paths';

/** Hisob cheklangan bo'lsa, foydalanuvchi qaysi sahifada bo'lishi shart. */
export const requiredSetupPath = (user: AuthProfile): string | null => {
  if (user.mustChangePassword) return ROUTES.setupPassword;
  if (user.mustSetupTwoFactor) return ROUTES.setupTwoFactor;
  return null;
};

/** Faqat ichki, nisbiy manzilga qaytariladi. */
const safeRedirect = (value: unknown): string =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : ROUTES.home;

/** Tizimga kirgan foydalanuvchilar uchun. Kirmaganlar login sahifasiga yo'naltiriladi. */
export function RequireAuth() {
  const status = useAuthStore((state) => state.status);
  const location = useLocation();

  if (status === 'loading') return <FullPageLoader />;
  if (status === 'unauthenticated') {
    return (
      <Navigate
        to={ROUTES.login}
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }
  return <Outlet />;
}

/** Login sahifasi: kirgan foydalanuvchi kelgan joyiga qaytariladi. */
export function GuestOnly() {
  const status = useAuthStore((state) => state.status);
  const location = useLocation();

  if (status === 'loading') return <FullPageLoader />;
  if (status === 'authenticated') {
    const from = (location.state as { from?: unknown } | null)?.from;
    return <Navigate to={safeRedirect(from)} replace />;
  }
  return <Outlet />;
}

/** Asosiy tizim: parol almashtirilmagan yoki 2FA ulanmagan bo'lsa kirib bo'lmaydi. */
export function RequireUnrestricted() {
  const user = useAuthStore((state) => state.user);
  if (!user) return null;

  const setupPath = requiredSetupPath(user);
  return setupPath ? <Navigate to={setupPath} replace /> : <Outlet />;
}

/** Majburiy sozlash sahifalari: faqat o'z navbati kelganda ochiladi. */
export function SetupOnly({ path }: { path: string }) {
  const user = useAuthStore((state) => state.user);
  if (!user) return null;

  const setupPath = requiredSetupPath(user);
  return setupPath === path ? <Outlet /> : <Navigate to={setupPath ?? ROUTES.home} replace />;
}

/** Foydalanuvchilar, rollar va audit log — faqat SUPER_ADMIN. */
export function RequireSuperAdmin() {
  const user = useAuthStore((state) => state.user);
  return isSuperAdmin(user) ? <Outlet /> : <ForbiddenPage />;
}

/** Bo'limni ko'rish ruxsati bo'lmasa — 403 sahifasi. */
export function RequirePermission({ permission }: { permission: string }) {
  const user = useAuthStore((state) => state.user);
  return hasPermissions(user, permission) ? <Outlet /> : <ForbiddenPage />;
}
