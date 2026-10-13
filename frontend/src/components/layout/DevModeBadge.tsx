import { FlaskConical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDevLogin } from '@/features/auth/api/dev-login.api';

/**
 * Parolsiz "tezkor kirish" yoqilganini eslatib turadigan belgi — bu rejimni
 * o'chirishni unutib qo'ymaslik uchun har sahifada ko'rinadi.
 */
export function DevModeBadge() {
  const { t } = useTranslation();
  if (!useDevLogin().enabled) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="mr-1 flex items-center gap-1.5 rounded-full border border-amber-500/50 bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-700 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 dark:text-amber-300"
        >
          <FlaskConical className="size-3.5" />
          <span className="max-sm:sr-only">{t('devLogin.badge')}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{t('devLogin.badgeHint')}</TooltipContent>
    </Tooltip>
  );
}
