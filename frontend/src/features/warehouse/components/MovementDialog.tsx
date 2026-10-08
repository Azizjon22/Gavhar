import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { errorMessage } from '@/lib/error-message';
import { cn } from '@/lib/utils';
import { warehouseApi, warehouseKeys } from '../api/warehouse.api';
import {
  formatQuantity,
  isPositiveQuantity,
  parseQuantityInput,
  toQuantityValue,
} from '../lib/quantity';
import { type MovementType, type WarehouseItem, isWholeUnit } from '../types/warehouse.types';

interface Props {
  /** Ochiq bo'lsa — qaysi mahsulot va qaysi harakat. */
  target: { item: WarehouseItem; movement: MovementType } | null;
  onClose: () => void;
}

/** Kirim (qo'shish) yoki chiqim (kamaytirish). Yangi qoldiq darhol ko'rsatiladi. */
export function MovementDialog({ target, onClose }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState('');
  const [cost, setCost] = useState('');
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  // Yopilish animatsiyasi paytida ham oxirgi mazmun ko'rinib turadi.
  const [last, setLast] = useState(target);
  const shown = target ?? last;

  useEffect(() => {
    if (!target) return;
    setLast(target);
    setQuantity('');
    setCost('');
    setNote('');
    setSubmitted(false);
  }, [target]);

  const mutation = useMutation({
    mutationFn: (current: NonNullable<Props['target']>) =>
      warehouseApi.addMovement(current.item.id, {
        type: current.movement,
        quantity: toQuantityValue(quantity),
        ...(current.movement === 'IN' && cost !== '' && { totalCost: cost }),
        note: note.trim() || null,
      }),
    onSuccess: async (_, current) => {
      await queryClient.invalidateQueries({ queryKey: warehouseKeys.all });
      toast.success(
        t(current.movement === 'IN' ? 'warehouse.toast.stockIn' : 'warehouse.toast.stockOut'),
      );
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (!shown) return null;
  const { item, movement } = shown;
  const isIn = movement === 'IN';
  const unit = t(`warehouse.unit.${item.unit}`);
  const allowFraction = !isWholeUnit(item.unit);

  const amount = Number(quantity) || 0;
  const current = Number(item.quantity);
  const exceeds = !isIn && amount > current;
  const valid =
    isPositiveQuantity(quantity) && !exceeds && (cost === '' || /^[1-9]\d*$/.test(cost));
  // Suzuvchi nuqta xatosi ko'rinmasligi uchun 3 xonagacha yaxlitlanadi.
  const next = Math.round((isIn ? current + amount : current - amount) * 1000) / 1000;

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => !open && !mutation.isPending && onClose()}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>
            {t(isIn ? 'warehouse.movement.inTitle' : 'warehouse.movement.outTitle')}
          </DialogTitle>
          <DialogDescription>{item.name}</DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
            if (valid && target) mutation.mutate(target);
          }}
        >
          <div className="grid content-start gap-2">
            <Label htmlFor="movement-quantity">
              {t(isIn ? 'warehouse.movement.inQuantity' : 'warehouse.movement.outQuantity')}
            </Label>
            <div className="relative">
              <Input
                id="movement-quantity"
                autoFocus
                inputMode={allowFraction ? 'decimal' : 'numeric'}
                className="tabular h-12 pr-16 text-lg font-semibold"
                placeholder="0"
                value={quantity.replace('.', ',')}
                aria-invalid={exceeds || (submitted && !isPositiveQuantity(quantity))}
                onChange={(event) =>
                  setQuantity(parseQuantityInput(event.target.value, allowFraction))
                }
              />
              <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-muted-foreground">
                {unit}
              </span>
            </div>
            {exceeds ? (
              <p role="alert" className="text-xs font-medium text-destructive">
                {t('errors.codes.INSUFFICIENT_STOCK', {
                  available: `${formatQuantity(item.quantity)} ${unit}`,
                })}
              </p>
            ) : (
              submitted &&
              !isPositiveQuantity(quantity) && (
                <p role="alert" className="text-xs font-medium text-destructive">
                  {t('validation.quantity')}
                </p>
              )
            )}
          </div>

          <p className="tabular flex items-center justify-center gap-3 rounded-xl bg-muted/60 px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              {formatQuantity(item.quantity)} {unit}
            </span>
            <ArrowRight className="size-4 text-muted-foreground" />
            <span
              className={cn(
                'text-base font-bold',
                exceeds ? 'text-destructive' : isIn ? 'text-success' : 'text-foreground',
              )}
            >
              {exceeds ? '—' : `${formatQuantity(String(next))} ${unit}`}
            </span>
          </p>

          {isIn && (
            <div className="grid content-start gap-2">
              <Label htmlFor="movement-cost">
                {t('warehouse.movement.cost')}{' '}
                <span className="font-normal text-muted-foreground">({t('common.optional')})</span>
              </Label>
              <MoneyInput id="movement-cost" value={cost} onChange={setCost} />
              <p className="text-xs text-muted-foreground">{t('warehouse.movement.costHint')}</p>
            </div>
          )}

          <div className="grid content-start gap-2">
            <Label htmlFor="movement-note">
              {t('warehouse.movement.note')}{' '}
              <span className="font-normal text-muted-foreground">({t('common.optional')})</span>
            </Label>
            <Input
              id="movement-note"
              value={note}
              maxLength={300}
              placeholder={t(
                isIn
                  ? 'warehouse.movement.inNotePlaceholder'
                  : 'warehouse.movement.outNotePlaceholder',
              )}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={mutation.isPending} disabled={exceeds}>
              {t(isIn ? 'warehouse.movement.inSubmit' : 'warehouse.movement.outSubmit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
