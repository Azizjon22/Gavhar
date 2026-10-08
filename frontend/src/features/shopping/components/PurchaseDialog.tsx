import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MoneyInput } from '@/components/shared/MoneyInput';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { financeKeys } from '@/features/finance/api/finance.api';
import {
  isPositiveQuantity,
  parseQuantityInput,
  toQuantityValue,
} from '@/features/warehouse/lib/quantity';
import { isWholeUnit } from '@/features/warehouse/types/warehouse.types';
import { errorMessage } from '@/lib/error-message';
import { formatAmount } from '@/lib/money';
import { cn } from '@/lib/utils';
import { shoppingApi, shoppingKeys } from '../api/shopping.api';
import type { KitchenEvent, ShoppingList } from '../types/shopping.types';

export interface PurchaseTarget {
  /** Berilmasa — umumiy bozorlik. */
  event?: KitchenEvent;
  list: ShoppingList;
}

interface Row {
  quantity: string;
  price: string;
  skipped: boolean;
}

interface Props {
  target: PurchaseTarget | null;
  onClose: () => void;
}

/**
 * Xarid: har bir mahsulotning narxi (shu qator uchun jami) va amalda olingan miqdori.
 * Bozorda yurganda oraliq saqlash mumkin; tugagach ro'yxat SUPER_ADMIN tasdig'iga o'tadi.
 */
export function PurchaseDialog({ target, onClose }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [last, setLast] = useState(target);
  const shown = target ?? last;
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [submitted, setSubmitted] = useState(false);
  // Narx ikki xil kiritiladi: shu qator uchun jami summa yoki 1 birlik (kg, dona) narxi.
  const [priceMode, setPriceMode] = useState<'total' | 'unit'>('total');

  useEffect(() => {
    if (!target) return;
    setLast(target);
    setRows(
      Object.fromEntries(
        target.list.items.map((item) => [
          item.id,
          {
            quantity: item.quantity,
            price: item.price ? (item.price.split('.')[0] ?? '') : '',
            skipped: item.skipped,
          },
        ]),
      ),
    );
    setSubmitted(false);
    setPriceMode('total');
  }, [target]);

  const mutation = useMutation({
    mutationFn: (input: { current: PurchaseTarget; complete: boolean }) =>
      shoppingApi.purchase(input.current.list.id, {
        complete: input.complete,
        items: input.current.list.items.map((item) => {
          const row = rows[item.id];
          const quantity =
            row && isPositiveQuantity(row.quantity) ? toQuantityValue(row.quantity) : item.quantity;
          if (row?.skipped) return { id: item.id, quantity, skipped: true };
          return { id: item.id, quantity, ...(row?.price && { price: row.price }) };
        }),
      }),
    onSuccess: async (_, input) => {
      await queryClient.invalidateQueries({ queryKey: shoppingKeys.all });
      void queryClient.invalidateQueries({ queryKey: financeKeys.all });
      toast.success(
        t(input.complete ? 'shopping.toast.purchased' : 'shopping.toast.progressSaved'),
      );
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (!shown) return null;
  const { list, event } = shown;
  // Sotib olingan ro'yxatda SUPER_ADMIN faqat narxlarni tuzatadi.
  const fixing = list.status === 'PURCHASED';

  /** 1 birlik narxidan qator jami: butun so'mgacha yaxlitlanadi. */
  const totalFromUnit = (unitPrice: string, quantity: string): string => {
    const total = Math.round((Number(unitPrice) || 0) * (Number(quantity) || 0));
    return total > 0 ? String(total) : '';
  };
  const unitFromTotal = (total: string, quantity: string): string => {
    const amount = Number(quantity) || 0;
    const unit = amount > 0 ? Math.round((Number(total) || 0) / amount) : 0;
    return unit > 0 ? String(unit) : '';
  };

  const patch = (id: string, change: Partial<Row>) =>
    setRows((current) => ({
      ...current,
      [id]: { quantity: '', price: '', skipped: false, ...current[id], ...change },
    }));
  const done = (row: Row | undefined) =>
    row !== undefined &&
    (row.skipped || (/^[1-9]\d*$/.test(row.price) && isPositiveQuantity(row.quantity)));
  const allDone = list.items.every((item) => done(rows[item.id]));
  const anyBought = list.items.some((item) => rows[item.id] && !rows[item.id]?.skipped);
  const total = list.items.reduce((sum, item) => {
    const row = rows[item.id];
    return row && !row.skipped ? sum + (Number(row.price) || 0) : sum;
  }, 0);
  const complete = () => {
    setSubmitted(true);
    if (allDone && anyBought && target) mutation.mutate({ current: target, complete: true });
  };

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => !open && !mutation.isPending && onClose()}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            {t(fixing ? 'shopping.purchase.fixTitle' : 'shopping.purchase.title')}
          </DialogTitle>
          <DialogDescription>
            {event
              ? `№ ${event.number} · ${event.title ?? t(`events.type.${event.type}`)}`
              : t('shopping.general.title')}{' '}
            · {list.createdByName}. {t('shopping.purchase.description')}
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="grid gap-4"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            complete();
          }}
        >
          <div
            role="radiogroup"
            aria-label={t('shopping.purchase.priceMode')}
            className="flex w-fit gap-1 rounded-xl bg-muted p-1 text-sm font-semibold"
          >
            {(['total', 'unit'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={priceMode === mode}
                onClick={() => setPriceMode(mode)}
                className={cn(
                  'cursor-pointer rounded-lg px-3 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                  priceMode === mode ? 'bg-card shadow-soft' : 'text-muted-foreground',
                )}
              >
                {t(mode === 'total' ? 'shopping.purchase.modeTotal' : 'shopping.purchase.modeUnit')}
              </button>
            ))}
          </div>

          <ul className="grid max-h-[48dvh] gap-2 overflow-y-auto pr-1">
            {list.items.map((item) => {
              const row = rows[item.id];
              const skipped = row?.skipped ?? false;
              const allowFraction = !isWholeUnit(item.unit);
              const invalid = submitted && !done(row);
              return (
                <li
                  key={item.id}
                  className={cn(
                    'grid gap-2 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_110px_170px] sm:items-center',
                    invalid && 'border-destructive/60',
                    skipped && 'bg-muted/50',
                  )}
                >
                  <div className="min-w-0">
                    <p
                      className={cn(
                        'font-semibold',
                        skipped && 'text-muted-foreground line-through',
                      )}
                    >
                      {item.name}
                    </p>
                    {item.note && <p className="text-xs text-muted-foreground">{item.note}</p>}
                    <label className="mt-1 flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                      <Checkbox
                        checked={skipped}
                        onCheckedChange={(checked) => patch(item.id, { skipped: checked === true })}
                      />
                      {t('shopping.purchase.skipped')}
                    </label>
                  </div>
                  <div className="relative">
                    <Input
                      inputMode={allowFraction ? 'decimal' : 'numeric'}
                      className="tabular pr-12 text-right"
                      disabled={skipped}
                      aria-label={t('shopping.purchase.quantityFor', { name: item.name })}
                      value={(row?.quantity ?? '').replace('.', ',')}
                      onChange={(inputEvent) => {
                        const quantity = parseQuantityInput(inputEvent.target.value, allowFraction);
                        // 1 birlik narxi kiritilayotgan bo'lsa, miqdor o'zgarganda jami qayta hisoblanadi.
                        patch(item.id, {
                          quantity,
                          ...(priceMode === 'unit' && {
                            price: totalFromUnit(
                              unitFromTotal(row?.price ?? '', row?.quantity ?? ''),
                              quantity,
                            ),
                          }),
                        });
                      }}
                    />
                    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
                      {t(`warehouse.unit.${item.unit}`)}
                    </span>
                  </div>
                  <div>
                    <MoneyInput
                      value={
                        skipped
                          ? ''
                          : priceMode === 'unit'
                            ? unitFromTotal(row?.price ?? '', row?.quantity ?? '')
                            : (row?.price ?? '')
                      }
                      disabled={skipped}
                      aria-label={t(
                        priceMode === 'unit'
                          ? 'shopping.purchase.unitPriceFor'
                          : 'shopping.purchase.priceFor',
                        { name: item.name },
                      )}
                      aria-invalid={invalid}
                      onChange={(value) =>
                        patch(item.id, {
                          price:
                            priceMode === 'unit'
                              ? totalFromUnit(value, row?.quantity ?? '')
                              : value,
                        })
                      }
                    />
                    {priceMode === 'unit' && !skipped && Number(row?.price) > 0 && (
                      <p className="tabular mt-1 text-right text-xs text-muted-foreground">
                        = {formatAmount(row?.price)} {t('common.currency')}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="flex items-baseline justify-between gap-3 rounded-xl bg-muted/60 px-4 py-3">
            <span className="text-sm font-medium">{t('shopping.total')}</span>
            <span className="tabular font-display text-2xl font-semibold whitespace-nowrap">
              {formatAmount(total)}{' '}
              <span className="font-sans text-xs font-medium text-muted-foreground">
                {t('common.currency')}
              </span>
            </span>
          </p>
          {submitted && !(allDone && anyBought) && (
            <p role="alert" className="-mt-1 text-xs font-medium text-destructive">
              {t(
                allDone
                  ? 'errors.codes.SHOPPING_NOTHING_PURCHASED'
                  : 'errors.codes.SHOPPING_PRICES_MISSING',
              )}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
              {t('common.cancel')}
            </Button>
            {!fixing && (
              <Button
                variant="outline"
                loading={mutation.isPending && mutation.variables?.complete === false}
                disabled={mutation.isPending}
                onClick={() => target && mutation.mutate({ current: target, complete: false })}
              >
                {t('shopping.purchase.saveProgress')}
              </Button>
            )}
            <Button
              type="submit"
              loading={mutation.isPending && mutation.variables?.complete === true}
              disabled={mutation.isPending}
            >
              {t(fixing ? 'common.save' : 'shopping.purchase.complete')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
