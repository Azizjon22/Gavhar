import { Eye, EyeOff } from 'lucide-react';
import { type InputHTMLAttributes, forwardRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Input } from './input';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  toggleClassName?: string;
};

/** Parolni ko'rsatish/yashirish tugmasi bilan. */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, toggleClassName, ...props }, ref) {
    const { t } = useTranslation();
    const [visible, setVisible] = useState(false);

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={cn('pr-11', className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={t(visible ? 'common.hidePassword' : 'common.showPassword')}
          aria-pressed={visible}
          className={cn(
            'absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-lg',
            'text-muted-foreground transition-colors outline-none hover:text-foreground',
            'focus-visible:ring-[3px] focus-visible:ring-ring/40',
            toggleClassName,
          )}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    );
  },
);
