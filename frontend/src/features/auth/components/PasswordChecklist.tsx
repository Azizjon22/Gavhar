import { Circle, CircleCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PASSWORD_RULES } from '@/lib/password-policy';
import { cn } from '@/lib/utils';

/** Parol talablari — yozish davomida bajarilganlari belgilanib boradi. */
export function PasswordChecklist({ value }: { value: string }) {
  const { t } = useTranslation();

  return (
    <ul aria-label={t('password.rules.title')} className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
      {PASSWORD_RULES.map((rule) => {
        const passed = rule.test(value);
        return (
          <li
            key={rule.key}
            className={cn(
              'flex items-center gap-2 text-xs transition-colors',
              passed ? 'font-medium text-success' : 'text-muted-foreground',
            )}
          >
            {passed ? (
              <CircleCheck className="size-3.5 shrink-0" />
            ) : (
              <Circle className="size-3.5 shrink-0" />
            )}
            {t(`password.rules.${rule.key}`)}
          </li>
        );
      })}
    </ul>
  );
}
