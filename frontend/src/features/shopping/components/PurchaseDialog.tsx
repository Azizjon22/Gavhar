import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Undo2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MoneyInput } from '@/components/shared/MoneyInput';
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
import { financeKeys } from '@/features/finance/api/finance.api';
import {
  formatQuantity,
  isPositiveQuantity,
  parseQuantityInput,
  toQuantityValue,
} from '@/features/warehouse/lib/quantity';
import { isWholeUnit } from '@/features/warehouse/types/warehouse.types';
import { errorMessage } from '@/lib/error-message';
import { formatTime } from '@/lib/format';
import { formatAmount } from '@/lib/money';
import { cn } from '@/lib/utils';
import { shoppingApi, shoppingKeys } from '../api/shopping.api';
import {
  type KitchenEvent,
  type ShoppingItem,
  type ShoppingList,
  isItemDone,
} from '../types/shopping.types';

export interface PurchaseTarget {
  /** Berilmasa — umumiy bozorlik. */
  event?: KitchenEvent;
  list: ShoppingList;
}

type PriceMode = 'total' | 'unit';

interface Draft {
  quantity: string;
  price: string;
}

type Step =
  | { kind: 'buy'; item: ShoppingItem; draft: Draft; mode: PriceMode }
  | { kind: 'skip'; item: ShoppingItem }
  | { kind: 'reset'; item: ShoppingItem }
  | { kind: 'fix'; item: ShoppingItem; price: string; mode: PriceMode };

interface Props {
  target: PurchaseTarget | null;
  onClose: () => void;
}

const isPrice = (value: string) => /^[1-9]\d*$/.test(value);

/**
 * Bozorda yurib xarid qilish: har bir mahsulot alohida "olindi" (amaldagi miqdor va
 * narx bilan) yoki "topilmadi" deb belgilanadi va darhol saqlanadi. Hammasi
 * belgilangach ro'yxat o'zi super admin tasdig'iga o'tadi. Xato bosilgan belgi bekor
 * qilinadi, narx esa keyin ham tuzatiladi (tasdiqlanguncha).
 */
export function PurchaseDialog({ target, onClose }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [list, setList] = useState<ShoppingList | null>(null);
  const [event, setEvent] = useState<KitchenEvent | undefined>();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [fixing, setFixing] = useState<{ id: string; price: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  // Narx ikki xil kiritiladi: shu qator uchun jami summa yoki 1 birlik (kg, dona) narxi.
  const [mode, setMode] = useState<PriceMode>('total');

  useEffect(() => {
    if (!target) return;
    setList(target.list);
    setEvent(target.event);
    setDrafts(
      Object.fromEntries(
        target.list.items.map((item) => [item.id, { quantity: item.quantity, price: '' }]),
      ),
    );
    setFixing(null);
    setErrors({});
  }, [target]);

  const mutation = useMutation({
    mutationFn: (step: Step) => {
      const id = list?.id ?? '';
      const itemId = step.item.id;
      if (step.kind === 'skip') return shoppingApi.skipItem(id, itemId);
      if (step.kind === 'reset') return shoppingApi.resetItem(id, itemId);
      if (step.kind === 'fix') {
        return shoppingApi.fixItemPrice(
          id,
          itemId,
          step.mode === 'unit' ? { unitPrice: step.price } : { price: step.price },
        );
      }
      const quantity = toQuantityValue(step.draft.quantity);
      return shoppingApi.purchaseItem(id, itemId, {
        ...(quantity !== step.item.quantity && { quantity }),
        ...(step.mode === 'unit' ? { unitPrice: step.draft.price } : { price: step.draft.price }),
      });
    },
    onSuccess: (updated, step) => {
      const finished = list?.status !== 'PURCHASED' && updated.status === 'PURCHASED';
      setList(updated);
      if (step.kind === 'fix') setFixing(null);
      if (step.kind === 'reset') {
        const item = updated.items.find((row) => row.id === step.item.id);
        if (item) {
          setDrafts((current) => ({
            ...current,
            [item.id]: { quantity: item.quantity, price: '' },
          }));
        }
      }
      void queryClient.invalidateQueries({ queryKey: shoppingKeys.all });
      void queryClient.invalidateQueries({ queryKey: financeKeys.all });
      if (finished) toast.success(t('shopping.toast.purchased'));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const shown = list;
  if (!shown) return null;

  const pending = mutation.isPending ? mutation.variables : undefined;
  const busyId = pending?.item.id ?? null;
  const doneCount = shown.items.filter(isItemDone).length;
  const confirmed = shown.status === 'CONFIRMED';

  const patchDraft = (id: string, change: Partial<Draft>) => {
    setDrafts((current) => ({
      ...current,
      [id]: { quantity: '', price: '', ...current[id], ...change },
    }));
    setErrors((current) => ({ ...current, [id]: false }));
  };
  const buy = (item: ShoppingItem) => {
    const draft = drafts[item.id] ?? { quantity: item.quantity, price: '' };
    if (!isPrice(draft.price) || !isPositiveQuantity(draft.quantity)) {
      setErrors((current) => ({ ...current, [item.id]: true }));
      return;
    }
    mutation.mutate({ kind: 'buy', item, draft, mode });
  };

  const priceLabel = (name: string) =>
    t(mode === 'unit' ? 'shopping.purchase.unitPriceFor' : 'shopping.purchase.priceFor', {
      name,
    });

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{t('shopping.purchase.title')}</DialogTitle>
          <DialogDescription>
            {event
              ? `№ ${event.number} · ${event.title ?? t(`events.type.${event.type}`)}`
              : t('shopping.general.title')}{' '}
            · {shown.createdByName}. {t('shopping.purchase.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              role="radiogroup"
              aria-label={t('shopping.purchase.priceMode')}
              className="flex w-fit gap-1 rounded-xl bg-muted p-1 text-sm font-semibold"
            >
              {(['total', 'unit'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={mode === value}
                  onClick={() => setMode(value)}
                  className={cn(
                    'cursor-pointer rounded-lg px-3 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                    mode === value ? 'bg-card shadow-soft' : 'text-muted-foreground',
                  )}
                >
                  {t(
                    value === 'total'
                      ? 'shopping.purchase.modeTotal'
                      : 'shopping.purchase.modeUnit',
                  )}
                </button>
              ))}
            </div>
            <div className="grid min-w-40 flex-1 gap-1.5 sm:max-w-56">
              <p className="tabular flex justify-between text-xs font-semibold text-muted-foreground">
                <span>{t('shopping.purchase.progress')}</span>
                <span>
                  {doneCount}/{shown.items.length}
                </span>
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-success transition-[width] duration-300"
                  style={{ width: `${(doneCount / Math.max(shown.items.length, 1)) * 100}%` }}
                />
              </div>
            </div>
          </div>

          <ul className="grid max-h-[52dvh] gap-2 overflow-y-auto pr-1">
            {shown.items.map((item) => {
              const unit = t(`warehouse.unit.${item.unit}`);
              const busy = busyId === item.id;
              const bought = !item.skipped && item.price !== null;

              if (isItemDone(item)) {
                const editing = fixing?.id === item.id;
                return (
                  <li
                    key={item.id}
                    className={cn(
                      'grid gap-2 rounded-xl border p-3',
                      bought ? 'border-success/30 bg-success/5' : 'bg-muted/50',
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                      <div className="min-w-0">
                        <p
                          className={cn(
                            'flex items-center gap-1.5 font-semibold',
                            item.skipped && 'text-muted-foreground line-through',
                          )}
                        >
                          {bought && <Check className="size-4 shrink-0 text-success" />}
                          {item.name}
                        </p>
                        <p className="tabular text-xs text-muted-foreground">
                          {item.skipped
                            ? t('shopping.purchase.skipped')
                            : `${formatQuantity(item.quantity)} ${unit}`}
                          {item.unitPrice &&
                            ` · ${t('shopping.purchase.perUnit', {
                              price: formatAmount(item.unitPrice),
                              unit,
                            })}`}
                          {item.purchasedByName &&
                            ` · ${item.purchasedByName}, ${formatTime(item.purchasedAt)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {bought && (
                          <span className="tabular mr-1 font-semibold whitespace-nowrap">
                            {formatAmount(item.price)} {t('common.currency')}
                          </span>
                        )}
                        {bought && !confirmed && !editing && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('shopping.purchase.fixPrice', { name: item.name })}
                            disabled={mutation.isPending}
                            onClick={() => setFixing({ id: item.id, price: '' })}
                          >
                            <Pencil />
                          </Button>
                        )}
                        {!confirmed && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('shopping.purchase.undo', { name: item.name })}
                            loading={busy && pending?.kind === 'reset'}
                            disabled={mutation.isPending}
                            onClick={() => mutation.mutate({ kind: 'reset', item })}
                          >
                            <Undo2 />
                          </Button>
                        )}
                      </div>
                    </div>
                    {editing && (
                      <form
                        noValidate
                        className="flex flex-wrap items-center gap-2"
                        onSubmit={(formEvent) => {
                          formEvent.preventDefault();
                          if (isPrice(fixing.price)) {
                            mutation.mutate({ kind: 'fix', item, price: fixing.price, mode });
                          }
                        }}
                      >
                        <MoneyInput
                          autoFocus
                          className="max-w-48"
                          value={fixing.price}
                          aria-label={priceLabel(item.name)}
                          onChange={(price) => setFixing({ id: item.id, price })}
                        />
                        <Button
                          type="submit"
                          size="sm"
                          loading={busy}
                          disabled={!isPrice(fixing.price) || mutation.isPending}
                        >
                          {t('common.save')}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setFixing(null)}>
                          {t('common.cancel')}
                        </Button>
                      </form>
                    )}
                  </li>
                );
              }

              const draft = drafts[item.id] ?? { quantity: item.quantity, price: '' };
              const allowFraction = !isWholeUnit(item.unit);
              const invalid = errors[item.id] === true;
              const preview =
                mode === 'unit' && isPrice(draft.price) && isPositiveQuantity(draft.quantity)
                  ? Math.round(Number(draft.price) * Number(toQuantityValue(draft.quantity)))
                  : null;
              return (
                <li
                  key={item.id}
                  className={cn(
                    'grid gap-2 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_104px_150px_auto] sm:items-start',
                    invalid && 'border-destructive/60',
                  )}
                >
                  <div className="min-w-0 sm:pt-1.5">
                    <p className="font-semibold">{item.name}</p>
                    <p className="tabular text-xs text-muted-foreground">
                      {t('shopping.purchase.planned', {
                        quantity: formatQuantity(item.quantity),
                        unit,
                      })}
                      {item.note && ` · ${item.note}`}
                    </p>
                  </div>
                  <div className="relative">
                    <Input
                      inputMode={allowFraction ? 'decimal' : 'numeric'}
                      className="tabular pr-12 text-right"
                      aria-label={t('shopping.purchase.quantityFor', { name: item.name })}
                      aria-invalid={invalid && !isPositiveQuantity(draft.quantity)}
                      value={draft.quantity.replace('.', ',')}
                      onChange={(inputEvent) =>
                        patchDraft(item.id, {
                          quantity: parseQuantityInput(inputEvent.target.value, allowFraction),
                        })
                      }
                    />
                    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
                      {unit}
                    </span>
                  </div>
                  <div>
                    <MoneyInput
                      value={draft.price}
                      aria-label={priceLabel(item.name)}
                      aria-invalid={invalid && !isPrice(draft.price)}
                      placeholder={t(
                        mode === 'unit'
                          ? 'shopping.purchase.unitPlaceholder'
                          : 'shopping.purchase.totalPlaceholder',
                      )}
                      onChange={(price) => patchDraft(item.id, { price })}
                      onKeyDown={(keyEvent) => {
                        if (keyEvent.key === 'Enter') {
                          keyEvent.preventDefault();
                          buy(item);
                        }
                      }}
                    />
                    {preview !== null && (
                      <p className="tabular mt-1 text-right text-xs text-muted-foreground">
                        = {formatAmount(preview)} {t('common.currency')}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      className="h-10 flex-1 sm:flex-none"
                      loading={busy && pending?.kind === 'buy'}
                      disabled={mutation.isPending}
                      onClick={() => buy(item)}
                    >
                      <Check />
                      {t('shopping.purchase.bought')}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={t('shopping.purchase.notFound', { name: item.name })}
                      title={t('shopping.purchase.skipped')}
                      loading={busy && pending?.kind === 'skip'}
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ kind: 'skip', item })}
                    >
                      <X />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="flex items-baseline justify-between gap-3 rounded-xl bg-muted/60 px-4 py-3">
            <span className="text-sm font-medium">{t('shopping.total')}</span>
            <span className="tabular font-display text-2xl font-semibold whitespace-nowrap">
              {formatAmount(shown.total)}{' '}
              <span className="font-sans text-xs font-medium text-muted-foreground">
                {t('common.currency')}
              </span>
            </span>
          </p>
          {shown.status === 'PURCHASED' && (
            <p className="-mt-1 text-sm text-muted-foreground">{t('shopping.purchase.allDone')}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
