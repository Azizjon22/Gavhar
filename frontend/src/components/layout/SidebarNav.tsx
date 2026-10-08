import { useTranslation } from 'react-i18next';
import { Link, useMatch } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { type NavItem, visibleNavGroups } from './nav';

interface SidebarNavProps {
  /** Faqat ikonkalar (tor sidebar). */
  collapsed?: boolean;
  /** Havola bosilganda (telefonda panelni yopish uchun). */
  onNavigate?: () => void;
}

export function SidebarNav({ collapsed = false, onNavigate }: SidebarNavProps) {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  if (!user) return null;

  return (
    <nav
      aria-label={t('nav.main')}
      className="flex flex-1 flex-col gap-6 overflow-x-hidden overflow-y-auto px-3 py-5"
    >
      {visibleNavGroups(user).map((group) => (
        <div key={group.key} className="flex flex-col gap-1">
          {group.labelKey &&
            (collapsed ? (
              <div className="mx-auto mb-1 h-px w-6 bg-sidebar-border" />
            ) : (
              <p className="px-3 pb-1.5 text-[10px] font-bold tracking-[0.2em] text-sidebar-muted/80 uppercase">
                {t(group.labelKey)}
              </p>
            ))}
          {group.items.map((item) => (
            <SidebarLink key={item.key} item={item} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </nav>
  );
}

interface SidebarLinkProps {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}

function SidebarLink({ item, collapsed, onNavigate }: SidebarLinkProps) {
  const { t } = useTranslation();
  const label = t(item.labelKey);
  const Icon = item.icon;
  // `NavLink` o'rniga `Link` + `useMatch`: NavLink'ning funksiya ko'rinishidagi
  // className'i Tooltip (Radix Slot) orqali o'tganda satrga aylanib buziladi.
  const isActive = useMatch({ path: item.to, end: item.end ?? false }) !== null;

  const link = (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={isActive ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      className={cn(
        'relative flex h-11 items-center gap-3 rounded-xl text-sm font-medium transition-colors outline-none',
        'focus-visible:ring-[3px] focus-visible:ring-gold/50',
        collapsed ? 'justify-center' : 'px-3.5',
        isActive
          ? 'bg-sidebar-accent text-white'
          : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground',
      )}
    >
      {isActive && (
        <span
          aria-hidden="true"
          className="bg-gold-gradient absolute inset-y-2.5 left-0 w-[3px] animate-in rounded-full duration-300 fade-in zoom-in-50"
        />
      )}
      <Icon className={cn('size-[18px] shrink-0', isActive && 'text-gold-light')} />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
