import {
  CalendarDays,
  CircleUser,
  ConciergeBell,
  House,
  Images,
  type LucideIcon,
  Package,
  Presentation,
  ScrollText,
  ShieldCheck,
  ShoppingBasket,
  Users,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import type { AuthProfile } from '@/features/auth/types/auth.types';

const hasRole = (user: AuthProfile, ...roles: string[]): boolean => roles.includes(user.role.key);

export interface NavItem {
  key: string;
  to: string;
  icon: LucideIcon;
  /** i18n kaliti. */
  labelKey: string;
  /** Faqat aniq mos kelganda faol (`/` uchun). */
  end?: boolean;
  /** Menyu bandi shu foydalanuvchiga ko'rinadimi (rol bo'yicha, Iqbol kabi). */
  visible: (user: AuthProfile) => boolean;
}

export interface NavGroup {
  key: string;
  labelKey?: string;
  items: NavItem[];
}

/**
 * Yon menyu Iqbol tartibida. Mijozlar, zallar va qo'shimcha xizmatlar menyuda yo'q,
 * lekin sahifalar ochiq qoladi.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    key: 'main',
    labelKey: 'nav.groupMain',
    items: [
      {
        key: 'home',
        to: '/',
        icon: House,
        labelKey: 'nav.home',
        end: true,
        visible: (user) => hasRole(user, 'SUPER_ADMIN', 'ZAVZAL'),
      },
      {
        key: 'events',
        to: '/events',
        icon: CalendarDays,
        labelKey: 'nav.events',
        visible: (user) => hasRole(user, 'SUPER_ADMIN', 'ADMIN', 'ZAVZAL'),
      },
      {
        key: 'showcase',
        to: '/showcase',
        icon: Presentation,
        labelKey: 'nav.showcase',
        visible: (user) => hasRole(user, 'SUPER_ADMIN', 'ADMIN'),
      },
    ],
  },
  {
    key: 'ops',
    labelKey: 'nav.work',
    items: [
      {
        key: 'menu',
        to: '/menu',
        icon: UtensilsCrossed,
        labelKey: 'nav.menu',
        visible: (user) => hasRole(user, 'SUPER_ADMIN'),
      },
      {
        key: 'gallery',
        to: '/gallery',
        icon: Images,
        labelKey: 'nav.gallery',
        visible: (user) => hasRole(user, 'SUPER_ADMIN', 'ADMIN'),
      },
      {
        key: 'workers',
        to: '/workers',
        icon: ConciergeBell,
        labelKey: 'nav.workers',
        visible: (user) => hasRole(user, 'SUPER_ADMIN', 'ADMIN', 'ZAVZAL'),
      },
      {
        key: 'warehouse',
        to: '/warehouse',
        icon: Package,
        labelKey: 'nav.warehouse',
        visible: (user) => hasRole(user, 'SUPER_ADMIN', 'ADMIN'),
      },
      {
        key: 'shopping',
        to: '/shopping',
        icon: ShoppingBasket,
        labelKey: 'nav.shopping',
        visible: (user) => hasRole(user, 'SUPER_ADMIN', 'ADMIN', 'COOK'),
      },
    ],
  },
  {
    key: 'finance',
    labelKey: 'nav.accounting',
    items: [
      {
        key: 'finance',
        to: '/finance',
        icon: Wallet,
        labelKey: 'nav.finance',
        visible: (user) => hasRole(user, 'SUPER_ADMIN'),
      },
    ],
  },
  {
    key: 'management',
    labelKey: 'nav.management',
    items: [
      {
        key: 'users',
        to: '/users',
        icon: Users,
        labelKey: 'nav.users',
        visible: (user) => hasRole(user, 'SUPER_ADMIN'),
      },
      {
        key: 'roles',
        to: '/roles',
        icon: ShieldCheck,
        labelKey: 'nav.roles',
        visible: (user) => hasRole(user, 'SUPER_ADMIN'),
      },
      {
        key: 'audit-logs',
        to: '/audit-logs',
        icon: ScrollText,
        labelKey: 'nav.auditLogs',
        visible: (user) => hasRole(user, 'SUPER_ADMIN'),
      },
      {
        key: 'profile',
        to: '/profile',
        icon: CircleUser,
        labelKey: 'nav.profile',
        visible: () => true,
      },
    ],
  },
];

export const visibleNavGroups = (user: AuthProfile): NavGroup[] =>
  NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.visible(user)),
  })).filter((group) => group.items.length > 0);

/** Menyuda yo'q, lekin topbar sarlavhasi kerak bo'lgan sahifalar. */
const EXTRA_TITLES: readonly { prefix: string; labelKey: string }[] = [
  { prefix: '/clients', labelKey: 'nav.clients' },
  { prefix: '/extra-services', labelKey: 'nav.extraServices' },
];

/** Joriy manzilga mos sahifa nomining i18n kaliti (topbar uchun). */
export function pageTitleKey(pathname: string): string | null {
  if (pathname.startsWith('/profile')) return 'nav.profile';

  const items = NAV_GROUPS.flatMap((group) => group.items);
  const match = items.find((item) =>
    item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`),
  );
  if (match) return match.labelKey;

  return (
    EXTRA_TITLES.find((item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`))
      ?.labelKey ?? null
  );
}
