import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatDateTime } from '@/lib/format';
import { describeUserAgent } from '@/lib/user-agent';
import type { AuditLog } from '../types/audit.types';

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  const { t } = useTranslation();
  const isEmpty = value === null || value === undefined;

  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      {isEmpty ? (
        <p className="rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
          {t('audit.detail.empty')}
        </p>
      ) : (
        <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/60 p-3 font-mono text-xs leading-relaxed">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="tabular mt-0.5 truncate text-sm font-medium" title={value}>
        {value}
      </dd>
    </div>
  );
}

interface AuditDetailDialogProps {
  log: AuditLog | null;
  actionLabel: (action: string) => string;
  onClose: () => void;
}

/** Bitta audit yozuvining to'liq tafsiloti: kim, qayerdan, oldingi va yangi qiymat. */
export function AuditDetailDialog({ log, actionLabel, onClose }: AuditDetailDialogProps) {
  const { t } = useTranslation();
  const device = describeUserAgent(log?.userAgent);

  return (
    <Dialog open={log !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        {log && (
          <>
            <DialogHeader>
              <DialogTitle>{actionLabel(log.action)}</DialogTitle>
              <DialogDescription className="font-mono text-xs">{log.action}</DialogDescription>
            </DialogHeader>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border bg-muted/40 p-4 sm:grid-cols-3">
              <Meta label={t('audit.columns.time')} value={formatDateTime(log.createdAt)} />
              <Meta
                label={t('audit.columns.actor')}
                value={log.actor?.fullName ?? log.actorEmail ?? t('audit.unknownActor')}
              />
              <Meta label={t('audit.columns.ip')} value={log.ip ?? '—'} />
              <Meta
                label={t('audit.detail.device')}
                value={
                  device
                    ? [device.browser, device.os].filter(Boolean).join(' · ')
                    : (log.userAgent ?? '—')
                }
              />
              <Meta
                label={t('audit.columns.resource')}
                value={log.resourceId ? `${log.resource} · ${log.resourceId}` : log.resource}
              />
              <Meta label={t('audit.detail.requestId')} value={log.requestId ?? '—'} />
            </dl>

            <div className="grid items-start gap-4 sm:grid-cols-2">
              <JsonBlock label={t('audit.detail.before')} value={log.before} />
              <JsonBlock label={t('audit.detail.after')} value={log.after} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
