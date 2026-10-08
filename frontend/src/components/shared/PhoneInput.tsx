import { type InputHTMLAttributes, forwardRef } from 'react';
import { Input } from '@/components/ui/input';
import { PHONE_PREFIX, extractLocalPhone, formatLocalPhone, toPhoneValue } from '@/lib/phone';
import { cn } from '@/lib/utils';

interface PhoneInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> {
  /** Bo'sh yoki "+998XXXXXXXXX" (yozilayotganda to'liq bo'lmasligi mumkin). */
  value: string;
  onChange: (value: string) => void;
}

/** O'zbekiston raqami: +998 qo'zg'almas, qolgan 9 raqam yozilishi bilan guruhlanadi. */
export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(function PhoneInput(
  { value, onChange, className, ...props },
  ref,
) {
  const local = extractLocalPhone(value);

  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="tabular pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground"
      >
        {PHONE_PREFIX}
      </span>
      <Input
        ref={ref}
        type="tel"
        inputMode="tel"
        autoComplete="off"
        placeholder="90 123 45 67"
        value={formatLocalPhone(local)}
        onChange={(event) => onChange(toPhoneValue(extractLocalPhone(event.target.value)))}
        className={cn('tabular pl-[3.4rem]', className)}
        {...props}
      />
    </div>
  );
});
