import { useCallback } from 'react';
import { hasPermissions, isSuperAdmin, useAuthStore } from '@/stores/auth.store';

/** Tugma va menyularni ruxsatga qarab ko'rsatish/yashirish uchun. */
export function usePermissions() {
  const user = useAuthStore((state) => state.user);

  const can = useCallback(
    (...permissions: string[]) => hasPermissions(user, ...permissions),
    [user],
  );

  return { can, isSuperAdmin: isSuperAdmin(user) };
}
