import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { AuthProfile } from '@/features/auth/types/auth.types';
import { isSuperAdmin } from '@/stores/auth.store';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-medium">{children}</dd>
    </div>
  );
}

/** Shaxsiy ma'lumotlar — faqat ko'rish uchun; o'zgartirishni SUPER_ADMIN qiladi. */
export function AccountCard({ user }: { user: AuthProfile }) {
  const { t } = useTranslation();
  const superAdmin = isSuperAdmin(user);

  return (
    <Card>
      <CardContent className="p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar name={user.fullName} size="lg" className="size-20 text-2xl" />
          <div className="min-w-0">
            <h2 className="truncate font-display text-2xl font-semibold tracking-tight">
              {user.fullName}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant={superAdmin ? 'gold' : 'secondary'}>{user.role.name}</Badge>
              <span className="truncate text-sm text-muted-foreground">{user.email}</span>
            </div>
          </div>
        </div>

        <dl className="mt-8 grid gap-6 border-t pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t('profile.account.email')}>{user.email}</Field>
          <Field label={t('profile.account.phone')}>
            <span className="tabular">{user.phone ?? t('profile.account.noPhone')}</span>
          </Field>
          <Field label={t('profile.account.role')}>{user.role.name}</Field>
          <Field label={t('profile.account.permissions')}>
            {superAdmin
              ? t('profile.account.allPermissions')
              : t('profile.account.permissionCount', { count: user.permissions.length })}
          </Field>
        </dl>

        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
          {t('profile.account.note')}
        </p>
      </CardContent>
    </Card>
  );
}
