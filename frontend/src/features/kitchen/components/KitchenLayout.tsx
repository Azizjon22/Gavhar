import { motion } from 'framer-motion';
import { CalendarHeart, House, type LucideIcon, ShoppingBasket, Warehouse } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ROUTES } from '@/app/router/paths';
import { DevModeBadge } from '@/components/layout/DevModeBadge';
import { LanguageSwitch } from '@/components/layout/LanguageSwitch';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { UserMenu } from '@/components/layout/UserMenu';
import { Logo } from '@/components/shared/Logo';
import { usePermissions } from '@/hooks/use-permissions';
import { cn } from '@/lib/utils';

interface Tab {
  to: string;
  icon: LucideIcon;
  labelKey: string;
  end?: boolean;
  permission?: string;
}

const TABS: Tab[] = [
  { to: ROUTES.kitchen, icon: House, labelKey: 'kitchen.nav.home', end: true },
  { to: ROUTES.kitchenEvents, icon: CalendarHeart, labelKey: 'kitchen.nav.events' },
  { to: ROUTES.kitchenShopping, icon: ShoppingBasket, labelKey: 'kitchen.nav.shopping' },
  {
    to: ROUTES.kitchenStock,
    icon: Warehouse,
    labelKey: 'kitchen.nav.stock',
    permission: 'warehouse:take',
  },
];

/**
 * Oshpaz ilovasi: ilova kabi qobiq — tepada ixcham sarlavha, telefonda pastda bosh
 * barmoq yetadigan tablar. Fonda oshxona surati, ustidan mavzu rangidagi parda.
 */
export function KitchenLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { can } = usePermissions();
  const tabs = TABS.filter((tab) => !tab.permission || can(tab.permission));

  return (
    <div className="relative isolate min-h-dvh pb-24 lg:pb-10">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-background">
        <img
          src="/kitchen/chef-kitchen.jpg"
          alt=""
          className="size-full object-cover opacity-90 dark:opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/90 to-background/96" />
      </div>

      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-2 px-4">
          {/* Eng tor telefonda faqat belgi — tugmalar sig'ishi uchun. */}
          <Logo compact className="min-[380px]:hidden" />
          <Logo className="hidden min-[380px]:flex" />
          <nav aria-label={t('kitchen.nav.label')} className="hidden items-center gap-1 lg:flex">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                    isActive
                      ? 'bg-primary/10 text-primary dark:text-gold-light'
                      : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {t(tab.labelKey)}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <DevModeBadge />
            <LanguageSwitch />
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto max-w-5xl px-4 py-5 outline-none sm:py-8"
      >
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <Outlet />
        </motion.div>
      </main>

      <nav
        aria-label={t('kitchen.nav.label')}
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        <div className="mx-auto flex max-w-md">
          {tabs.map(({ to, icon: Icon, labelKey, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors outline-none',
                  isActive ? 'text-primary dark:text-gold-light' : 'text-muted-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'flex h-8 w-14 items-center justify-center rounded-full transition-colors',
                      isActive && 'bg-primary/10 dark:bg-gold/15',
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  {t(labelKey)}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
