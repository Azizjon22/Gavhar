import { useTranslation } from 'react-i18next';
import { Logo } from '@/components/shared/Logo';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { SidebarNav } from './SidebarNav';

interface MobileNavProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Telefon va planshetda chapdan chiqadigan menyu. */
export function MobileNav({ open, onOpenChange }: MobileNavProps) {
  const { t } = useTranslation();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="bg-sidebar-gradient border-r border-sidebar-border text-sidebar-foreground">
        <SheetTitle className="sr-only">{t('nav.main')}</SheetTitle>
        <SheetDescription className="sr-only">{t('common.appName')}</SheetDescription>
        <div className="flex h-16 shrink-0 items-center border-b border-sidebar-border px-5">
          <Logo onClick={() => onOpenChange(false)} />
        </div>
        <SidebarNav onNavigate={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}
