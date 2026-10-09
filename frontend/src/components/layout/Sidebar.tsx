import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Logo } from '@/components/shared/Logo';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui.store';
import { SidebarNav } from './SidebarNav';

/** Desktop uchun yig'iladigan yon menyu. Telefonda `MobileNav` ishlatiladi. */
export function Sidebar() {
  const { t } = useTranslation();
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggle = useUiStore((state) => state.toggleSidebar);
  const toggleLabel = t(collapsed ? 'nav.expand' : 'nav.collapse');

  return (
    <aside
      className={cn(
        'bg-sidebar-gradient sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-sidebar-border text-sidebar-foreground',
        'transition-[width] duration-300 ease-out lg:flex',
        collapsed ? 'w-[76px]' : 'w-[268px]',
      )}
    >
      <div
        className={cn(
          'flex h-16 shrink-0 items-center border-b border-sidebar-border',
          collapsed ? 'justify-center' : 'px-5',
        )}
      >
        <Logo compact={collapsed} />
      </div>

      <SidebarNav collapsed={collapsed} />

      <div className="border-t border-sidebar-border p-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={toggleLabel}
          aria-expanded={!collapsed}
          className={cn(
            'flex h-10 w-full cursor-pointer items-center gap-3 rounded-xl text-sm font-medium text-sidebar-muted transition-colors outline-none',
            'hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-[3px] focus-visible:ring-gold/50',
            collapsed ? 'justify-center' : 'px-3.5',
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-[18px]" />
          ) : (
            <PanelLeftClose className="size-[18px]" />
          )}
          {!collapsed && <span>{toggleLabel}</span>}
        </button>
      </div>
    </aside>
  );
}
