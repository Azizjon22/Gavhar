import { type InputHTMLAttributes, forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { formatAmount, parseAmountInput } from '@/lib/money';
import { cn } from '@/lib/utils';

interface MoneyInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> {
  /** Faqat raqamlar: "15000000". */
  value: string;
  onChange: (value: string) => void;
}

/** So'mdagi summa: yozilishi bilan minglik bo'yicha guruhlanadi. */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onChange, className, ...props },
  ref,
) {
  const { t } = useTranslation();

  return (
    <div className="relative">
      <Input
        ref={ref}
        inputMode="numeric"
        autoComplete="off"
        placeholder="0"
        value={value ? formatAmount(value) : ''}
        onChange={(event) => onChange(parseAmountInput(event.target.value))}
        className={cn('tabular pr-14', className)}
        {...props}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground"
      >
        {t('common.currency')}
      </span>
    </div>
  );
});
