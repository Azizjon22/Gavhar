import { PackageOpen, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { formatDate, formatDateTime } from '@/lib/format';
import { formatAmount } from '@/lib/money';
import { formatQuantity } from '../lib/quantity';
import type { StockUsage } from '../types/warehouse.types';

interface Props {
  usages: StockUsage[];
  /** To'y nomini ko'rsatish (umumiy ro'yxatda); to'y sahifasida kerak emas. */
  showEvent?: boolean;
  /** Berilsa — "qaytarish" tugmasi chiqadi (shu yozuvga ruxsat bo'lsa). */
  canReturn?: (usage: StockUsage) => boolean;
  onReturn?: (usage: StockUsage) => void;
  returningId?: string | null;
}

/** Ombordan to'y uchun olinganlar: kim, qachon, nima va (SUPER_ADMIN'ga) qanchaga tushgani. */
export function StockUsageList({ usages, showEvent, canReturn, onReturn, returningId }: Props) {
  const { t } = useTranslation();
  return (
    <ul className="grid gap-2">
      {usages.map((usage) => (
        <li key={usage.id} className="rounded-xl border p-3">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <div className="flex min-w-0 flex-1 items-start gap-2.5">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-gold/14 text-gold-dark dark:text-gold-light">
                <PackageOpen className="size-4" />
              </span>
              <div className="min-w-0">
                {showEvent && (
                  <p className="truncate font-semibold">
                    № {usage.event.number} · {usage.event.title ?? usage.event.clientName}
                    <span className="tabular ml-2 text-xs font-normal text-muted-foreground">
                      {formatDate(usage.event.startAt)}
                    </span>
                  </p>
                )}
                <p className="tabular text-xs text-muted-foreground">
                  {usage.takenByName} · {formatDateTime(usage.createdAt)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {usage.totalCost !== undefined && (
                <span className="tabular text-right text-sm font-semibold whitespace-nowrap">
                  {formatAmount(usage.totalCost)} {t('common.currency')}
                  {usage.unpriced && (
                    <span className="block text-xs font-normal text-warning">
                      {t('warehouse.usages.unpriced')}
                    </span>
                  )}
                </span>
              )}
              {onReturn && canReturn?.(usage) && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('warehouse.usages.giveBack')}
                  title={t('warehouse.usages.giveBack')}
                  loading={returningId === usage.id}
                  onClick={() => onReturn(usage)}
                >
                  <Undo2 />
                </Button>
              )}
            </div>
          </div>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {usage.items.map((item) => (
              <li
                key={item.id}
                className="tabular rounded-full bg-muted px-2.5 py-1 text-xs font-medium"
              >
                {item.name} — {formatQuantity(item.quantity)} {t(`warehouse.unit.${item.unit}`)}
                {item.totalCost && (
                  <span className="text-muted-foreground"> · {formatAmount(item.totalCost)}</span>
                )}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
