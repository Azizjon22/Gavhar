import { useMutation } from '@tanstack/react-query';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { errorMessage } from '@/lib/error-message';
import { formatAmount, toSum } from '@/lib/money';
import { eventsApi } from '../api/events.api';
import type { EventDetail, PaymentKind, PaymentMethod } from '../types/event.types';

interface Props {
  event: EventDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (event: EventDetail) => void;
}

const METHODS: PaymentMethod[] = ['CASH', 'CARD', 'TRANSFER'];

/**
 * To'lov qabul qilish yoki mijozga pul qaytarish (so'mda). To'lov qarzdan, qaytarish
 * olingan puldan oshmaydi; to'liq to'langan bron o'zi tasdiqlanadi.
 */
export function PaymentDialog({ event, open, onOpenChange, onDone }: Props) {
  const { t } = useTranslation();
  const cancelled = event.status === 'CANCELLED';
  const debt = toSum(event.debt);
  const paid = toSum(event.paidAmount);

  const [kind, setKind] = useState<PaymentKind>('PAYMENT');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    // Bekor qilingan bronda — faqat qaytarish; to'liq to'langanida — odatda qaytarish.
    setKind(cancelled || debt === 0 ? 'REFUND' : 'PAYMENT');
    setMethod('CASH');
    setAmount('');
    setNote('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const amountValid = toSum(amount) > 0;
  const limit = kind === 'REFUND' ? paid : debt;
  const overLimit = toSum(amount) > limit;

  const mutation = useMutation({
    mutationFn: () =>
      eventsApi.addPayment(event.id, {
        kind,
        method,
        amount,
        note: note.trim() || null,
      }),
    onSuccess: (updated) => {
      toast.success(t(kind === 'REFUND' ? 'payments.toast.refunded' : 'payments.toast.accepted'));
      onDone(updated);
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const kinds: PaymentKind[] = cancelled ? ['REFUND'] : ['PAYMENT', 'REFUND'];
  const quickFills =
    kind === 'REFUND'
      ? [{ label: t('payments.fill.allPaid'), value: paid }]
      : [{ label: t('payments.fill.fullDebt'), value: debt }];

  return (
    <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t('payments.dialog.title')}</DialogTitle>
          <DialogDescription>
            {t('payments.dialog.description', {
              debt: formatAmount(event.debt),
              paid: formatAmount(event.paidAmount),
            })}
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-5"
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            if (amountValid && !overLimit) mutation.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="payment-kind">{t('payments.kind.label')}</Label>
              <Select value={kind} onValueChange={(value) => setKind(value as PaymentKind)}>
                <SelectTrigger id="payment-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {kinds.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`payments.kind.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="payment-method">{t('payments.method.label')}</Label>
              <Select value={method} onValueChange={(value) => setMethod(value as PaymentMethod)}>
                <SelectTrigger id="payment-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`payments.method.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="payment-amount">{t('payments.amount')}</Label>
            <MoneyInput id="payment-amount" value={amount} onChange={setAmount} />
            {overLimit && (
              <p role="alert" className="text-xs font-medium text-destructive">
                {t(kind === 'REFUND' ? 'payments.overPaid' : 'payments.overDebt', {
                  limit: formatAmount(limit),
                })}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {quickFills
                .filter((fill) => fill.value > 0)
                .map((fill) => (
                  <Button
                    key={fill.label}
                    variant="secondary"
                    size="sm"
                    onClick={() => setAmount(String(fill.value))}
                  >
                    {fill.label}: {formatAmount(fill.value)}
                  </Button>
                ))}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="payment-note">
              {t('payments.note')}{' '}
              <span className="font-normal text-muted-foreground">({t('common.optional')})</span>
            </Label>
            <Input
              id="payment-note"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              variant={kind === 'REFUND' ? 'destructive' : 'default'}
              loading={mutation.isPending}
              disabled={!amountValid || overLimit}
            >
              {t(kind === 'REFUND' ? 'payments.submitRefund' : 'payments.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
