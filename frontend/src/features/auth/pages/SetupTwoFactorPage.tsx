import { useTranslation } from 'react-i18next';
import { syncProfile } from '@/lib/auth-session';
import { SetupShell } from '../components/SetupShell';
import { TwoFactorSetupFlow } from '../components/TwoFactorSetupFlow';

/** SUPER_ADMIN uchun: ikki bosqichli himoya ulanmaguncha tizim ochilmaydi. */
export function SetupTwoFactorPage() {
  const { t } = useTranslation();

  return (
    <SetupShell
      eyebrow={t('setup.eyebrow')}
      title={t('setup.twoFactor.title')}
      description={t('setup.twoFactor.description')}
    >
      <TwoFactorSetupFlow
        onComplete={async () => {
          await syncProfile();
        }}
      />
    </SetupShell>
  );
}
