import {
  Building2,
  CalendarDays,
  ConciergeBell,
  Contact,
  House,
  Images,
  type LucideIcon,
  Package,
  Presentation,
  ScrollText,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
  Users,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import type { AuthProfile } from '@/features/auth/types/auth.types';
import { hasPermissions, isSuperAdmin } from '@/stores/auth.store';

/** Taqdimotda ko'rsatadigan biror narsasi bor foydalanuvchi. */
const canSeeShowcase = (user: AuthProfile): boolean =>
  ['halls:read', 'menu:read', 'media:read'].some((key) => hasPermissions(user, key));

export interface NavItem {
  key: string;
  to: string;
  icon: LucideIcon;
  /** i18n kaliti. */
  labelKey: string;
  /** Faqat aniq mos kelganda faol (`/` uchun). */
  end?: boolean;
  /** Menyu bandi shu foydalanuvchiga ko'rinadimi (ruxsat bo'yicha). */
  visible: (user: AuthProfile) => boolean;
}

export interface NavGroup {
  key: string;
  labelKey?: string;
  items: NavItem[];
}

/** Yon menyuning yagona manbai. Har yangi modul shu yerga bitta band qo'shadi. */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    key: 'main',
    items: [
      { key: 'home', to: '/', icon: House, labelKey: 'nav.home', end: true, visible: () => true },
    ],
  },
  {
    key: 'work',
    labelKey: 'nav.work',
    items: [
      {
        key: 'events',
        to: '/events',
        icon: CalendarDays,
        labelKey: 'nav.events',
        visible: (user) => hasPermissions(user, 'events:read'),
      },
      {
        key: 'shopping',
        to: '/shopping',
        icon: ShoppingBasket,
        labelKey: 'nav.shopping',
        visible: (user) => hasPermissions(user, 'shopping:read'),
      },
      {
        key: 'workers',
        to: '/workers',
        icon: ConciergeBell,
        labelKey: 'nav.workers',
        visible: (user) => hasPermissions(user, 'staff:read'),
      },
      {
        key: 'clients',
        to: '/clients',
        icon: Contact,
        labelKey: 'nav.clients',
        visible: (user) => hasPermissions(user, 'clients:read'),
      },
      {
        key: 'halls',
        to: '/halls',
        icon: Building2,
        labelKey: 'nav.halls',
        visible: (user) => hasPermissions(user, 'halls:read'),
      },
      {
        key: 'extra-services',
        to: '/extra-services',
        icon: Sparkles,
        labelKey: 'nav.extraServices',
        visible: (user) => hasPermissions(user, 'events:read'),
      },
      {
        key: 'menu',
        to: '/menu',
        icon: UtensilsCrossed,
        labelKey: 'nav.menu',
        visible: (user) => hasPermissions(user, 'menu:read'),
      },
      {
        key: 'gallery',
        to: '/gallery',
        icon: Images,
        labelKey: 'nav.gallery',
        visible: (user) => hasPermissions(user, 'media:read'),
      },
    ],
  },
  {
    key: 'accounting',
    labelKey: 'nav.accounting',
    items: [
      {
        key: 'finance',
        to: '/finance',
        icon: Wallet,
        labelKey: 'nav.finance',
        visible: (user) => hasPermissions(user, 'finance:read'),
      },
      {
        key: 'warehouse',
        to: '/warehouse',
        icon: Package,
        labelKey: 'nav.warehouse',
        visible: (user) => hasPermissions(user, 'warehouse:read'),
      },
    ],
  },
  {
    key: 'clientFacing',
    labelKey: 'nav.clientFacing',
    items: [
      {
        key: 'showcase',
        to: '/showcase',
        icon: Presentation,
        labelKey: 'nav.showcase',
        visible: canSeeShowcase,
      },
    ],
  },
  {
    key: 'management',
    labelKey: 'nav.management',
    items: [
      { key: 'users', to: '/users', icon: Users, labelKey: 'nav.users', visible: isSuperAdmin },
      {
        key: 'roles',
        to: '/roles',
        icon: ShieldCheck,
        labelKey: 'nav.roles',
        visible: isSuperAdmin,
      },
      {
        key: 'audit-logs',
        to: '/audit-logs',
        icon: ScrollText,
        labelKey: 'nav.auditLogs',
        visible: isSuperAdmin,
      },
    ],
  },
];

export const visibleNavGroups = (user: AuthProfile): NavGroup[] =>
  NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.visible(user)),
  })).filter((group) => group.items.length > 0);

/** Joriy manzilga mos sahifa nomining i18n kaliti (topbar uchun). */
export function pageTitleKey(pathname: string): string | null {
  if (pathname.startsWith('/profile')) return 'nav.profile';

  const items = NAV_GROUPS.flatMap((group) => group.items);
  const match = items.find((item) =>
    item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`),
  );
  return match?.labelKey ?? null;
}
