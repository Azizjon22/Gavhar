import { RefreshCw, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/error-message';

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
}

/** Ma'lumot yuklanmaganda: sabab va qayta urinish tugmasi. */
export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const { t } = useTranslation();

  return (
    <div role="alert" className="flex flex-col items-center gap-4 px-6 py-14 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <TriangleAlert className="size-6" />
      </span>
      <div className="space-y-1.5">
        <p className="font-display text-xl font-semibold">{t('errors.loadFailed')}</p>
        <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
          {errorMessage(error)}
        </p>
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw />
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}
