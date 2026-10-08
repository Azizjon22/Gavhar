import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { authKeys } from '@/features/auth/api/auth.api';
import { ChangePasswordForm } from '@/features/auth/components/ChangePasswordForm';

export function PasswordCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.password.title')}</CardTitle>
        <CardDescription>{t('profile.password.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Parol o'zgargach boshqa qurilmalardagi sessiyalar yopiladi — ro'yxat yangilanadi. */}
        <ChangePasswordForm
          submitLabel={t('profile.password.submit')}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: authKeys.sessions })}
        />
      </CardContent>
    </Card>
  );
}
