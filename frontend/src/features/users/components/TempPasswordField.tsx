import { Copy, RefreshCw } from 'lucide-react';
import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { copyToClipboard } from '@/lib/clipboard';
import { generatePassword } from '@/lib/password-policy';

interface TempPasswordFieldProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  name?: string;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/**
 * Vaqtinchalik parol: ochiq ko'rinadi (admin uni xodimga yetkazishi kerak),
 * bir tugma bilan generatsiya qilinadi va nusxalanadi.
 */
export const TempPasswordField = forwardRef<HTMLInputElement, TempPasswordFieldProps>(
  function TempPasswordField({ value, onChange, ...props }, ref) {
    const { t } = useTranslation();

    return (
      <div className="flex gap-2">
        <Input
          ref={ref}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          {...props}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label={t('users.form.generate')}
              onClick={() => onChange(generatePassword())}
            >
              <RefreshCw />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('users.form.generate')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label={t('common.copy')}
              disabled={!value}
              onClick={() => void copyToClipboard(value)}
            >
              <Copy />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('common.copy')}</TooltipContent>
        </Tooltip>
      </div>
    );
  },
);
