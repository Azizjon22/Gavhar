import { useTranslation } from 'react-i18next';
import { syncProfile } from '@/lib/auth-session';
import { ChangePasswordForm } from '../components/ChangePasswordForm';
import { SetupShell } from '../components/SetupShell';

/** Birinchi kirish yoki parol tiklangandan keyin: yangi parol o'rnatish majburiy. */
export function SetupPasswordPage() {
  const { t } = useTranslation();

  return (
    <SetupShell
      eyebrow={t('setup.eyebrow')}
      title={t('setup.password.title')}
      description={t('setup.password.description')}
    >
      {/* Profil yangilangach router keyingi qadamga o'zi o'tkazadi. */}
      <ChangePasswordForm
        submitLabel={t('setup.password.submit')}
        onSuccess={async () => {
          await syncProfile();
        }}
      />
    </SetupShell>
  );
}
