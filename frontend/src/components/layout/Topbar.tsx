import { Menu } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LanguageSwitch } from './LanguageSwitch';
import { ShoppingBell } from './ShoppingBell';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';
import { pageTitleKey } from './nav';

interface TopbarProps {
  onOpenMobileNav: () => void;
}

export function Topbar({ onOpenMobileNav }: TopbarProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const titleKey = pageTitleKey(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-xl lg:px-8">
      <Button
        variant="ghost"
        size="icon"
        onClick={onOpenMobileNav}
        aria-label={t('nav.openMenu')}
        className="-ml-2 lg:hidden"
      >
        <Menu className="size-5" />
      </Button>

      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-muted-foreground">
        {titleKey ? t(titleKey) : ''}
      </p>

      <div className="flex items-center gap-1">
        <ShoppingBell />
        <LanguageSwitch />
        <ThemeToggle />
        <span className="mx-1.5 hidden h-6 w-px bg-border sm:block" />
        <UserMenu />
      </div>
    </header>
  );
}
