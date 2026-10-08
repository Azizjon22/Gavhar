import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage } from '@/lib/error-message';
import { cn } from '@/lib/utils';
import { warehouseApi, warehouseKeys } from '../api/warehouse.api';
import { formatQuantity, parseQuantityInput, toQuantityValue } from '../lib/quantity';
import { type WarehouseItem, isWholeUnit } from '../types/warehouse.types';

interface Props {
  item: WarehouseItem | null;
  onClose: () => void;
}

/**
 * Inventarizatsiya: omborda sanab chiqilgan haqiqiy miqdor kiritiladi, tizim farqni
 * o'zi kirim yoki chiqim qilib yozadi.
 */
export function StocktakeDialog({ item, onClose }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [last, setLast] = useState(item);
  const shown = item ?? last;
  const [actual, setActual] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!item) return;
    setLast(item);
    setActual(item.quantity);
    setNote('');
  }, [item]);

  const mutation = useMutation({
    mutationFn: (target: WarehouseItem) =>
      warehouseApi.count(target.id, {
        actual: toQuantityValue(actual) || '0',
        note: note.trim() || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: warehouseKeys.all });
      toast.success(t('warehouse.toast.counted'));
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (!shown) return null;
  const unit = t(`warehouse.unit.${shown.unit}`);
  const allowFraction = !isWholeUnit(shown.unit);
  const valid = /^\d{1,9}(\.\d{0,3})?$/.test(actual);
  const diff = Math.round(((Number(actual) || 0) - Number(shown.quantity)) * 1000) / 1000;

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t('warehouse.stocktake.title')}</DialogTitle>
          <DialogDescription>
            {shown.name} ·{' '}
            {t('warehouse.history.balance', {
              quantity: `${formatQuantity(shown.quantity)} ${unit}`,
            })}
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && item) mutation.mutate(item);
          }}
        >
          <div className="grid content-start gap-2">
            <Label htmlFor="stocktake-actual">{t('warehouse.stocktake.actual')}</Label>
            <div className="relative">
              <Input
                id="stocktake-actual"
                autoFocus
                inputMode={allowFraction ? 'decimal' : 'numeric'}
                className="tabular h-12 pr-16 text-lg font-semibold"
                value={actual.replace('.', ',')}
                onChange={(event) =>
                  setActual(parseQuantityInput(event.target.value, allowFraction))
                }
              />
              <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-muted-foreground">
                {unit}
              </span>
            </div>
          </div>

          <p
            className={cn(
              'tabular rounded-xl bg-muted/60 px-4 py-3 text-center text-sm',
              diff > 0 && 'text-success',
              diff < 0 && 'text-destructive',
            )}
          >
            {diff === 0
              ? t('warehouse.stocktake.same')
              : t(diff > 0 ? 'warehouse.stocktake.surplus' : 'warehouse.stocktake.shortage', {
                  quantity: `${formatQuantity(String(Math.abs(diff)))} ${unit}`,
                })}
          </p>

          <div className="grid content-start gap-2">
            <Label htmlFor="stocktake-note">
              {t('warehouse.movement.note')}{' '}
              <span className="font-normal text-muted-foreground">({t('common.optional')})</span>
            </Label>
            <Input
              id="stocktake-note"
              value={note}
              maxLength={200}
              placeholder={t('warehouse.stocktake.notePlaceholder')}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={mutation.isPending} disabled={!valid}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
