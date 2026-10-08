import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorState } from '@/components/shared/ErrorState';
import { Pagination } from '@/components/shared/Pagination';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/format';
import { formatAmount } from '@/lib/money';
import { cn } from '@/lib/utils';
import { warehouseApi, warehouseKeys } from '../api/warehouse.api';
import { formatQuantity } from '../lib/quantity';
import type { WarehouseItem } from '../types/warehouse.types';

interface Props {
  item: WarehouseItem | null;
  onClose: () => void;
}

/** Mahsulot bo'yicha kirim-chiqim tarixi: kim, qachon, qancha va qoldiq. */
export function HistoryDialog({ item, onClose }: Props) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  // Yopilish animatsiyasi paytida oxirgi mahsulot ko'rinib turadi.
  const [last, setLast] = useState(item);
  const shown = item ?? last;

  useEffect(() => {
    if (!item) return;
    setLast(item);
    setPage(1);
  }, [item]);

  const query = useQuery({
    queryKey: warehouseKeys.movements(item?.id ?? '', page),
    queryFn: () => warehouseApi.movements(item?.id ?? '', page),
    enabled: item !== null,
    // Sahifa almashganda eski ro'yxat turadi, lekin boshqa mahsulotniki ko'rsatilmaydi.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === item?.id ? previous : undefined,
  });

  if (!shown) return null;
  const unit = t(`warehouse.unit.${shown.unit}`);

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t('warehouse.history.title')}</DialogTitle>
          <DialogDescription>
            {shown.name} ·{' '}
            {t('warehouse.history.balance', {
              quantity: `${formatQuantity(shown.quantity)} ${unit}`,
            })}
          </DialogDescription>
        </DialogHeader>

        {query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : !query.data ? (
          <div className="grid gap-2">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : query.data.items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('warehouse.history.empty')}
          </p>
        ) : (
          <>
            <ul className="grid max-h-[55dvh] gap-2 overflow-y-auto">
              {query.data.items.map((movement) => {
                const isIn = movement.type === 'IN';
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
                      <p className="tabular flex flex-wrap items-baseline justify-between gap-x-3 font-semibold">
                        <span>
                          {isIn ? '+' : '−'}
                          {formatQuantity(movement.quantity)} {unit}
                        </span>
                        <span className="text-xs font-medium text-muted-foreground">
                          {t('warehouse.history.after', {
                            quantity: `${formatQuantity(movement.balanceAfter)} ${unit}`,
                          })}
                        </span>
                      </p>
                      {movement.note && <p className="mt-0.5 text-sm">{movement.note}</p>}
                      {movement.totalCost && (
                        <p className="tabular mt-0.5 text-sm text-muted-foreground">
                          {t('warehouse.history.cost', {
                            amount: formatAmount(movement.totalCost),
                          })}
                        </p>
                      )}
                      <p className="tabular mt-1 text-xs text-muted-foreground">
                        {formatDateTime(movement.createdAt)}
                        {movement.createdByName && ` · ${movement.createdByName}`}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
            {query.data.meta.totalPages > 1 && (
              <Pagination meta={query.data.meta} onPageChange={setPage} />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
