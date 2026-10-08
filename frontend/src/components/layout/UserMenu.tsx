import { ChevronDown, CircleUser, LogOut } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Avatar } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { logoutSession } from '@/lib/auth-session';
import { useAuthStore } from '@/stores/auth.store';

export function UserMenu() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const [loggingOut, setLoggingOut] = useState(false);
  if (!user) return null;

  const handleLogout = () => {
    setLoggingOut(true);
    // Tugagach router login sahifasiga o'tkazadi — komponent yo'qoladi.
    void logoutSession();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('nav.account')}
        className="flex cursor-pointer items-center gap-2.5 rounded-full py-1 pr-1 pl-1 transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:pr-3"
      >
        <Avatar name={user.fullName} size="sm" />
        <span className="hidden min-w-0 flex-col text-left leading-tight sm:flex">
          <span className="max-w-40 truncate text-sm font-semibold">{user.fullName}</span>
          <span className="max-w-40 truncate text-xs text-muted-foreground">{user.role.name}</span>
        </span>
        <ChevronDown className="hidden size-4 text-muted-foreground sm:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <Avatar name={user.fullName} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{user.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile">
            <CircleUser />
            {t('nav.profile')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" disabled={loggingOut} onSelect={handleLogout}>
          <LogOut />
          {t('nav.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
