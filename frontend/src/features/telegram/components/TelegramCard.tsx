import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, ExternalLink, Link2Off, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ErrorState } from '@/components/shared/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/error-message';
import { formatDateTime } from '@/lib/format';
import { telegramApi, telegramKeys } from '../api/telegram.api';

/**
 * Profil: Telegram botini ulash. Bir martalik havola Telegram'ni ochadi, u yerda
 * «Start» bosilgach hisob ulanadi — sahifa buni o'zi sezadi.
 */
export function TelegramCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState(false);

  const query = useQuery({
    queryKey: telegramKeys.status,
    queryFn: telegramApi.status,
    // Havola ochilgandan keyin ulanishni kutib turadi.
    refetchInterval: pendingUrl ? 2500 : false,
  });
  const status = query.data;

  useEffect(() => {
    if (pendingUrl && status?.linked) {
      setPendingUrl(null);
      toast.success(t('telegram.toast.linked'));
    }
  }, [pendingUrl, status?.linked, t]);

  const linkMutation = useMutation({
    mutationFn: telegramApi.createLink,
    onSuccess: ({ url }) => {
      setPendingUrl(url);
      window.open(url, '_blank', 'noopener');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const unlinkMutation = useMutation({
    mutationFn: telegramApi.unlink,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: telegramKeys.status });
      toast.success(t('telegram.toast.unlinked'));
      setUnlinking(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Send className="size-5 text-[#229ED9]" />
          {t('telegram.title')}
          {status?.linked && <Badge variant="success">{t('telegram.linked')}</Badge>}
        </CardTitle>
        <CardDescription>{t('telegram.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : !status ? (
          <Skeleton className="h-20 rounded-xl" />
        ) : !status.enabled ? (
          <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
            {t('telegram.disabled')}
          </p>
        ) : status.linked ? (
          <>
            <p className="text-sm text-muted-foreground">
              {t('telegram.linkedSince', { date: formatDateTime(status.linkedAt) })}
            </p>
            <ul className="grid gap-1.5 text-sm">
              {(['notify', 'remind', 'miniApp'] as const).map((key) => (
                <li key={key} className="flex items-start gap-2">
                  <BellRing className="mt-0.5 size-4 shrink-0 text-gold-dark dark:text-gold-light" />
                  {t(`telegram.features.${key}`)}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              {status.botUsername && (
                <Button asChild variant="outline">
                  <a href={`https://t.me/${status.botUsername}`} target="_blank" rel="noreferrer">
                    <ExternalLink />
                    {t('telegram.openBot', { name: status.botUsername })}
                  </a>
                </Button>
              )}
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setUnlinking(true)}
              >
                <Link2Off />
                {t('telegram.unlink')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <ol className="grid gap-1.5 text-sm text-muted-foreground">
              {(['one', 'two', 'three'] as const).map((key, index) => (
                <li key={key} className="flex gap-2">
                  <span className="tabular flex size-5 shrink-0 items-center justify-center rounded-full bg-gold/15 text-[11px] font-bold text-gold-dark dark:text-gold-light">
                    {index + 1}
                  </span>
                  {t(`telegram.steps.${key}`, { name: status.botUsername ?? '' })}
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center gap-3">
              <Button loading={linkMutation.isPending} onClick={() => linkMutation.mutate()}>
                <Send />
                {t('telegram.link')}
              </Button>
              {pendingUrl && (
                <p className="text-sm text-muted-foreground">
                  {t('telegram.waiting')}{' '}
                  <a
                    href={pendingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-primary underline-offset-4 hover:underline dark:text-gold-light"
                  >
                    {t('telegram.openAgain')}
                  </a>
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
      <ConfirmDialog
        open={unlinking}
        onOpenChange={setUnlinking}
        title={t('telegram.unlinkTitle')}
        description={t('telegram.unlinkText')}
        confirmLabel={t('telegram.unlink')}
        variant="destructive"
        loading={unlinkMutation.isPending}
        onConfirm={() => unlinkMutation.mutate()}
      />
    </Card>
  );
}
