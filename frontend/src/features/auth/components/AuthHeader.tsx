import { LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitch } from '@/components/layout/LanguageSwitch';
import { BrandMark } from '@/components/shared/Logo';
import { useBrand } from '@/features/settings/api/brand.api';
import { Button } from '@/components/ui/button';
import { logoutSession } from '@/lib/auth-session';

interface AuthHeaderProps {
  /** Majburiy sozlash sahifalarida: boshqa hisob bilan kirish uchun. */
  showLogout?: boolean;
}

export function AuthHeader({ showLogout = false }: AuthHeaderProps) {
  const { t } = useTranslation();
  const brand = useBrand();

  return (
    <header className="flex items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
      <span className="flex items-center gap-2.5">
        <BrandMark className="size-8" />
        <span className="text-gold-gradient font-display text-2xl font-semibold tracking-tight">
          {brand.name}
        </span>
      </span>
      <div className="flex items-center gap-1">
        <LanguageSwitch onDark />
        {showLogout && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void logoutSession()}
            className="h-9 text-white/75 hover:bg-white/10 hover:text-white"
          >
            <LogOut />
            {t('nav.logout')}
          </Button>
        )}
      </div>
    </header>
  );
}
