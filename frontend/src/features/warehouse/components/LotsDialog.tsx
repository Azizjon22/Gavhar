import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MoneyInput } from '@/components/shared/MoneyInput';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { errorMessage } from '@/lib/error-message';
import { formatDateTime } from '@/lib/format';
import { formatAmount } from '@/lib/money';
import { warehouseApi, warehouseKeys } from '../api/warehouse.api';
import { formatQuantity } from '../lib/quantity';
import type { WarehouseItem } from '../types/warehouse.types';

interface Props {
  item: WarehouseItem | null;
  onClose: () => void;
}

/**
 * Partiyalar (faqat SUPER_ADMIN): mahsulot qaysi narxda qancha kirgani. Chiqim — eng
 * eski partiyadan; to'yga olingan mahsulot o'sha partiya narxida hisoblanadi. Narxsiz
 * kirgan partiyaga keyin narx qo'yiladi.
 */
export function LotsDialog({ item, onClose }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState(item);
  const [editing, setEditing] = useState<{ id: string; price: string } | null>(null);

  useEffect(() => {
    if (item) setCurrent(item);
    setEditing(null);
  }, [item]);

  const mutation = useMutation({
    mutationFn: (input: { id: string; price: string }) =>
      warehouseApi.setLotPrice(input.id, input.price),
    onSuccess: (updated) => {
      setCurrent(updated);
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: warehouseKeys.all });
      toast.success(t('warehouse.lots.saved'));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (!current) return null;
  const unit = t(`warehouse.unit.${current.unit}`);
  const lots = current.lots ?? [];

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            {t('warehouse.lots.title')}: {current.name}
          </DialogTitle>
          <DialogDescription>{t('warehouse.lots.description')}</DialogDescription>
        </DialogHeader>

        {lots.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('warehouse.lots.empty')}
          </p>
        ) : (
          <ol className="grid max-h-[55dvh] gap-2 overflow-y-auto">
            {lots.map((lot, index) => {
              const isEditing = editing?.id === lot.id;
              return (
                <li key={lot.id} className="grid gap-2 rounded-xl border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <div className="min-w-0">
                      <p className="tabular font-semibold">
                        {formatQuantity(lot.quantity)} {unit}
                        {index === 0 && lots.length > 1 && (
                          <Badge variant="secondary" className="ml-2 align-middle">
                            {t('warehouse.lots.next')}
                          </Badge>
                        )}
                      </p>
                      <p className="tabular text-xs text-muted-foreground">
                        {formatDateTime(lot.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {lot.unitPrice ? (
                        <span className="tabular text-right text-sm">
                          <span className="font-semibold">
                            {t('warehouse.lots.perUnit', {
                              price: formatAmount(lot.unitPrice),
                              unit,
                            })}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            = {formatAmount(Number(lot.unitPrice) * Number(lot.quantity))}{' '}
                            {t('common.currency')}
                          </span>
                        </span>
                      ) : (
                        <Badge variant="warning">{t('warehouse.lots.noPrice')}</Badge>
                      )}
                      {!isEditing && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t('warehouse.lots.setPrice')}
                          onClick={() =>
                            setEditing({ id: lot.id, price: lot.unitPrice?.split('.')[0] ?? '' })
                          }
                        >
                          <Pencil />
                        </Button>
                      )}
                    </div>
                  </div>
                  {isEditing && (
                    <form
                      noValidate
                      className="flex flex-wrap items-center gap-2"
                      onSubmit={(formEvent) => {
                        formEvent.preventDefault();
                        if (/^[1-9]\d*$/.test(editing.price)) mutation.mutate(editing);
                      }}
                    >
                      <MoneyInput
                        autoFocus
                        className="max-w-48"
                        value={editing.price}
                        placeholder={t('warehouse.lots.pricePlaceholder', { unit })}
                        aria-label={t('warehouse.lots.setPrice')}
                        onChange={(price) => setEditing({ id: lot.id, price })}
                      />
                      <Button
                        type="submit"
                        size="sm"
                        loading={mutation.isPending}
                        disabled={!/^[1-9]\d*$/.test(editing.price)}
                      >
                        {t('common.save')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                        {t('common.cancel')}
                      </Button>
                    </form>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        <p className="tabular flex items-baseline justify-between gap-3 rounded-xl bg-muted/60 px-4 py-3">
          <span className="text-sm font-medium">{t('warehouse.lots.value')}</span>
          <span className="font-display text-xl font-semibold whitespace-nowrap">
            {formatAmount(current.stockValue)} {t('common.currency')}
          </span>
        </p>
        {Number(current.unpricedQuantity) > 0 && (
          <p className="-mt-2 text-xs text-muted-foreground">
            {t('warehouse.lots.unpriced', {
              quantity: `${formatQuantity(current.unpricedQuantity ?? '0')} ${unit}`,
            })}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
