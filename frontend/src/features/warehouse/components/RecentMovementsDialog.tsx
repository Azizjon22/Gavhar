import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ErrorState } from '@/components/shared/ErrorState';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { warehouseApi, warehouseKeys } from '../api/warehouse.api';
import { formatQuantity } from '../lib/quantity';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Butun ombor bo'yicha so'nggi kirim-chiqimlar: nima, qancha, kim va qachon. */
export function RecentMovementsDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: warehouseKeys.recent,
    queryFn: warehouseApi.recentMovements,
    enabled: open,
    staleTime: 0,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t('warehouse.recent.title')}</DialogTitle>
          <DialogDescription>{t('warehouse.recent.description')}</DialogDescription>
        </DialogHeader>
        {query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : !query.data ? (
          <div className="grid gap-2">
            {[0, 1, 2, 3].map((row) => (
              <Skeleton key={row} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : query.data.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('warehouse.recent.empty')}
          </p>
        ) : (
          <ul className="grid max-h-[60dvh] gap-2 overflow-y-auto">
            {query.data.map((movement) => {
              const isIn = movement.type === 'IN';
              const unit = t(`warehouse.unit.${movement.item.unit}`);
              return (
                <li key={movement.id} className="flex items-start gap-3 rounded-xl border p-3">
                  <span
                    className={cn(
                      'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg',
                      isIn
                        ? 'bg-success/12 text-success'
                        : 'bg-gold/14 text-gold-dark dark:text-gold-light',
                    )}
                  >
                    {isIn ? (
                      <ArrowDownLeft className="size-4" />
                    ) : (
                      <ArrowUpRight className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline justify-between gap-x-3 font-semibold">
                      <span className="min-w-0 truncate">{movement.item.name}</span>
                      <span className="tabular whitespace-nowrap">
                        {isIn ? '+' : '−'}
                        {formatQuantity(movement.quantity)} {unit}
                      </span>
                    </p>
                    {movement.note && <p className="text-sm">{movement.note}</p>}
                    <p className="tabular mt-0.5 text-xs text-muted-foreground">
                      {t(`warehouse.section.${movement.item.section}`)} ·{' '}
                      {formatDateTime(movement.createdAt)}
                      {movement.createdByName && ` · ${movement.createdByName}`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
