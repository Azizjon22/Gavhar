import dayjs from 'dayjs';
import {
  ArrowRight,
  CalendarDays,
  CircleUser,
  ConciergeBell,
  Contact,
  Images,
  type LucideIcon,
  Package,
  Presentation,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  ShoppingBasket,
  Users,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router-dom';
import { ROUTES } from '@/app/router/paths';
import { GemMark } from '@/components/shared/Logo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DashboardOverview } from '@/features/dashboard/components/DashboardOverview';
import { usePermissions } from '@/hooks/use-permissions';
import { APP_TIMEZONE } from '@/lib/format';
import { useAuthStore } from '@/stores/auth.store';

interface QuickLink {
  to: string;
  icon: LucideIcon;
  titleKey: string;
  textKey: string;
  superAdminOnly?: boolean;
  /** Berilsa — faqat shu ruxsati borlarga ko'rinadi. */
  permission?: string;
  /** Berilsa — shu ruxsatlardan kamida bittasi borlarga ko'rinadi. */
  anyPermission?: readonly string[];
}

const QUICK_LINKS: readonly QuickLink[] = [
  {
    to: ROUTES.events,
    icon: CalendarDays,
    titleKey: 'nav.events',
    textKey: 'home.links.events',
    permission: 'events:read',
  },
  {
    to: ROUTES.shopping,
    icon: ShoppingBasket,
    titleKey: 'nav.shopping',
    textKey: 'home.links.shopping',
    permission: 'shopping:read',
  },
  {
    to: ROUTES.workers,
    icon: ConciergeBell,
    titleKey: 'nav.workers',
    textKey: 'home.links.workers',
    permission: 'staff:read',
  },
  {
    to: ROUTES.clients,
    icon: Contact,
    titleKey: 'nav.clients',
    textKey: 'home.links.clients',
    permission: 'clients:read',
  },
  {
    to: ROUTES.finance,
    icon: Wallet,
    titleKey: 'nav.finance',
    textKey: 'home.links.finance',
    permission: 'finance:read',
  },
  {
    to: ROUTES.warehouse,
    icon: Package,
    titleKey: 'nav.warehouse',
    textKey: 'home.links.warehouse',
    permission: 'warehouse:read',
  },
  {
    to: ROUTES.menu,
    icon: UtensilsCrossed,
    titleKey: 'nav.menu',
    textKey: 'home.links.menu',
    permission: 'menu:read',
  },
  {
    to: ROUTES.gallery,
    icon: Images,
    titleKey: 'nav.gallery',
    textKey: 'home.links.gallery',
    permission: 'media:read',
  },
  {
    to: ROUTES.showcase,
    icon: Presentation,
    titleKey: 'nav.showcase',
    textKey: 'home.links.showcase',
    anyPermission: ['menu:read', 'media:read'],
  },
  {
    to: ROUTES.users,
    icon: Users,
    titleKey: 'nav.users',
    textKey: 'home.links.users',
    superAdminOnly: true,
  },
  {
    to: ROUTES.roles,
    icon: ShieldCheck,
    titleKey: 'nav.roles',
    textKey: 'home.links.roles',
    superAdminOnly: true,
  },
  {
    to: ROUTES.auditLogs,
    icon: ScrollText,
    titleKey: 'nav.auditLogs',
    textKey: 'home.links.audit',
    superAdminOnly: true,
  },
  { to: ROUTES.profile, icon: CircleUser, titleKey: 'nav.profile', textKey: 'home.links.profile' },
];

/** Toshkent vaqti bo'yicha salomlashuv kaliti. */
const greetingKey = (): string => {
  const hour = dayjs().tz(APP_TIMEZONE).hour();
  if (hour >= 5 && hour < 11) return 'home.greeting.morning';
  if (hour >= 11 && hour < 17) return 'home.greeting.day';
  if (hour >= 17 && hour < 22) return 'home.greeting.evening';
  return 'home.greeting.night';
};

export function HomePage() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const { can, isSuperAdmin } = usePermissions();
  if (!user) return null;
  // Iqbol: ADMIN boshqaruv panelini ko'rmaydi — unda tushum bor.
  if (user.role.key === 'ADMIN') return <Navigate to={ROUTES.events} replace />;

  const firstName = user.fullName.trim().split(/\s+/)[0] ?? user.fullName;
  const links = QUICK_LINKS.filter(
    (link) =>
      (!link.superAdminOnly || isSuperAdmin) &&
      (!link.permission || can(link.permission)) &&
      (!link.anyPermission || link.anyPermission.some((permission) => can(permission))),
  );

  return (
    <div className="grid gap-6">
      <section className="bg-sidebar-gradient relative overflow-hidden rounded-3xl border border-sidebar-border p-7 text-sidebar-foreground shadow-lifted sm:p-10">
        <GemMark className="pointer-events-none absolute -top-8 -right-8 size-56 opacity-[0.13]" />
        <div
          className="pointer-events-none absolute -bottom-24 left-1/3 size-72 rounded-full bg-gold/20 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative max-w-2xl">
          <p className="tabular text-xs font-bold tracking-[0.2em] text-gold-light uppercase">
            {dayjs().tz(APP_TIMEZONE).format('D MMMM YYYY, dddd')}
          </p>
          <h1 className="mt-3 font-display text-3xl leading-tight font-semibold tracking-tight text-white sm:text-5xl">
            {t(greetingKey())}, <span className="text-gold-gradient italic">{firstName}</span>
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-sidebar-muted sm:text-base">
            {t('home.subtitle')}
          </p>
        </div>
      </section>

      {can('dashboard:read') && <DashboardOverview />}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>{t('home.role.label')}</CardDescription>
            <CardTitle className="flex flex-wrap items-center gap-3">
              {user.role.name}
              {isSuperAdmin && <Badge variant="gold">{t('home.role.fullAccess')}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed text-muted-foreground">
            {isSuperAdmin
              ? t('home.role.superAdminText')
              : t('home.role.permissionsText', { count: user.permissions.length })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>{t('home.security.label')}</CardDescription>
            <CardTitle className="flex items-center gap-3">
              {user.twoFactorEnabled ? (
                <>
                  <ShieldCheck className="size-6 text-success" />
                  {t('home.security.enabled')}
                </>
              ) : (
                <>
                  <ShieldAlert className="size-6 text-warning" />
                  {t('home.security.disabled')}
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-4 text-sm leading-relaxed text-muted-foreground">
            {t(user.twoFactorEnabled ? 'home.security.enabledText' : 'home.security.disabledText')}
            {!user.twoFactorEnabled && (
              <Button asChild variant="outline" size="sm">
                <Link to={`${ROUTES.profile}?tab=security`}>
                  {t('home.security.enable')}
                  <ArrowRight />
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="quick-links-title" className="grid gap-4">
        <h2 id="quick-links-title" className="font-display text-2xl font-semibold tracking-tight">
          {t('home.links.title')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {links.map(({ to, icon: Icon, titleKey, textKey }) => (
            <Link
              key={to}
              to={to}
              className="group rounded-2xl border bg-card p-5 shadow-soft transition-all outline-none hover:-translate-y-0.5 hover:border-gold/60 hover:shadow-lifted focus-visible:ring-[3px] focus-visible:ring-ring/40"
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-gold/15 group-hover:text-gold-dark dark:group-hover:text-gold-light">
                <Icon className="size-5" />
              </span>
              <p className="mt-4 flex items-center gap-1.5 font-semibold">
                {t(titleKey)}
                <ArrowRight className="size-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t(textKey)}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
