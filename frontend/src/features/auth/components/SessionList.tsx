import { Laptop, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime, formatRelative } from '@/lib/format';
import { describeUserAgent } from '@/lib/user-agent';
import type { SessionInfo } from '../types/auth.types';

interface SessionListProps {
  sessions: SessionInfo[] | undefined;
  loading: boolean;
  /** Hozir yopilayotgan sessiya — uning tugmasida spinner ko'rinadi. */
  revokingId: string | null;
  onRevoke: (session: SessionInfo) => void;
  emptyText: string;
}

/** Faol sessiyalar: qurilma, IP va oxirgi faollik. Profil va admin oynasida ishlatiladi. */
export function SessionList({
  sessions,
  loading,
  revokingId,
  onRevoke,
  emptyText,
}: SessionListProps) {
  const { t } = useTranslation();

  if (loading || !sessions) {
    return (
      <div className="grid gap-3">
        {[0, 1].map((index) => (
          <Skeleton key={index} className="h-[72px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <ul className="grid gap-3">
      {sessions.map((session) => {
        const device = describeUserAgent(session.userAgent);
        const DeviceIcon = device?.isMobile ? Smartphone : Laptop;
        const deviceName = device
          ? [device.browser, device.os].filter(Boolean).join(' · ')
          : t('sessions.unknownDevice');

        return (
          <li
            key={session.id}
            className="flex items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <DeviceIcon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                <span className="truncate">{deviceName}</span>
                {session.isCurrent && <Badge variant="success">{t('sessions.current')}</Badge>}
              </p>
              <p
                className="tabular mt-0.5 truncate text-xs text-muted-foreground"
                title={formatDateTime(session.lastUsedAt)}
              >
                {session.ip ?? '—'} ·{' '}
                {t('sessions.lastActive', { time: formatRelative(session.lastUsedAt) })}
              </p>
            </div>
            {!session.isCurrent && (
              <Button
                variant="outline"
                size="sm"
                loading={revokingId === session.id}
                onClick={() => onRevoke(session)}
              >
                {t('sessions.revoke')}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
