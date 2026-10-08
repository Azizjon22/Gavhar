import { useTranslation } from 'react-i18next';
import { GemMark } from './Logo';

/** Sessiya tekshirilayotganda yoki sahifa yuklanayotganda. */
export function FullPageLoader() {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background"
    >
      <span className="relative flex size-20 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-gold/15 [animation-duration:1.8s]" />
        <GemMark className="size-12 animate-pulse" />
      </span>
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  );
}
