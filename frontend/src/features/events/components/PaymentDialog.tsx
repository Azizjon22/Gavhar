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
import { formatAmount } from '@/lib/money';
import { cn } from '@/lib/utils';
import { eventsApi } from '../api/events.api';
import { toSum } from '../lib/pricing';
import type { Currency, EventDetail, PaymentKind, PaymentMethod } from '../types/event.types';

interface Props {
  event: EventDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (event: EventDetail) => void;
}

const METHODS: PaymentMethod[] = ['CASH', 'CARD', 'TRANSFER'];
const USD_AMOUNT = /^\d{1,9}(\.\d{1,2})?$/;
const RATE = /^[1-9]\d{0,8}(\.\d{1,4})?$/;

/** To'lov qabul qilish yoki pul qaytarish. So'mdagi qiymat serverda hisoblanadi. */
export function PaymentDialog({ event, open, onOpenChange, onDone }: Props) {
  const { t } = useTranslation();
  const cancelled = event.status === 'CANCELLED';
  const debt = toSum(event.debt);
  const paid = toSum(event.paidAmount);
  const depositLeft = Math.max(0, toSum(event.requiredDeposit) - paid);

  const [kind, setKind] = useState<PaymentKind>('PAYMENT');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [currency, setCurrency] = useState<Currency>('UZS');
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    // Zaklad hali to'lanmagan so'rovda — zaklad; bekor qilingan bronda — faqat qaytarish.
    setKind(
      cancelled ? 'REFUND' : event.status === 'REQUEST' && depositLeft > 0 ? 'DEPOSIT' : 'PAYMENT',
    );
    setMethod('CASH');
    setCurrency('UZS');
    setAmount('');
    setRate('');
    setNote('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isUsd = currency === 'USD';
  const amountValid = isUsd ? USD_AMOUNT.test(amount) && Number(amount) > 0 : toSum(amount) > 0;
  const rateValid = !isUsd || RATE.test(rate);
  const inUzs = isUsd ? Math.round(Number(amount || 0) * Number(rate || 0)) : toSum(amount);
  const limit = kind === 'REFUND' ? paid : debt;
  const overLimit = inUzs > limit;

  const mutation = useMutation({
    mutationFn: () =>
      eventsApi.addPayment(event.id, {
        kind,
        method,
        currency,
        amount,
        ...(isUsd && { exchangeRate: rate }),
        note: note.trim() || null,
      }),
    onSuccess: (updated) => {
      toast.success(t(kind === 'REFUND' ? 'payments.toast.refunded' : 'payments.toast.accepted'));
      onDone(updated);
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const kinds: PaymentKind[] = cancelled ? ['REFUND'] : ['DEPOSIT', 'PAYMENT', 'REFUND'];
  const quickFills =
    kind === 'REFUND'
      ? [{ label: t('payments.fill.allPaid'), value: paid }]
      : [
          ...(depositLeft > 0 && depositLeft < debt
            ? [{ label: t('payments.fill.deposit'), value: depositLeft }]
            : []),
          { label: t('payments.fill.fullDebt'), value: debt },
        ];

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
            if (amountValid && rateValid && !overLimit) mutation.mutate();
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
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="payment-amount">{t('payments.amount')}</Label>
              <div
                role="radiogroup"
                aria-label={t('payments.currency')}
                className="flex rounded-lg bg-muted p-0.5"
              >
                {(['UZS', 'USD'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={currency === value}
                    onClick={() => {
                      setCurrency(value);
                      setAmount('');
                    }}
                    className={cn(
                      'cursor-pointer rounded-md px-2.5 py-1 text-xs font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                      currency === value ? 'bg-card shadow-soft' : 'text-muted-foreground',
                    )}
                  >
                    {value === 'UZS' ? t('common.currency') : '$'}
                  </button>
                ))}
              </div>
            </div>
            {isUsd ? (
              <div className="grid grid-cols-2 gap-4">
                <Input
                  id="payment-amount"
                  inputMode="decimal"
                  placeholder="1000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                  className="tabular"
                />
                <Input
                  inputMode="decimal"
                  aria-label={t('payments.rate')}
                  placeholder={t('payments.ratePlaceholder')}
                  value={rate}
                  onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))}
                  className="tabular"
                />
              </div>
            ) : (
              <MoneyInput id="payment-amount" value={amount} onChange={setAmount} />
            )}

            {isUsd && inUzs > 0 && (
              <p className="tabular text-xs text-muted-foreground">
                = {formatAmount(inUzs)} {t('common.currency')}
              </p>
            )}
            {overLimit && (
              <p role="alert" className="text-xs font-medium text-destructive">
                {t(kind === 'REFUND' ? 'payments.overPaid' : 'payments.overDebt', {
                  limit: formatAmount(limit),
                })}
              </p>
            )}
            {!isUsd && (
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
            )}
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
              disabled={!amountValid || !rateValid || overLimit}
            >
              {t(kind === 'REFUND' ? 'payments.submitRefund' : 'payments.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
