import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ErrorState } from '@/components/shared/ErrorState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { authApi, authKeys } from '@/features/auth/api/auth.api';
import { SessionList } from '@/features/auth/components/SessionList';
import { errorMessage } from '@/lib/error-message';

/** O'zining faol sessiyalari: qaysi qurilmalardan kirilgan va ularni uzish. */
export function SessionsCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const sessionsQuery = useQuery({ queryKey: authKeys.sessions, queryFn: authApi.sessions });
  const refresh = () => queryClient.invalidateQueries({ queryKey: authKeys.sessions });

  const revokeOne = useMutation({
    mutationFn: authApi.revokeSession,
    onSuccess: async () => {
      await refresh();
      toast.success(t('sessions.revoked'));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const revokeOthers = useMutation({
    mutationFn: authApi.revokeOtherSessions,
    onSuccess: async () => {
      await refresh();
      toast.success(t('sessions.allRevoked'));
      setConfirmOpen(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const hasOthers = sessionsQuery.data?.some((session) => !session.isCurrent) ?? false;

  return (
    <Card>
      <CardHeader className="sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="grid gap-1.5">
          <CardTitle>{t('profile.sessions.title')}</CardTitle>
          <CardDescription>{t('profile.sessions.description')}</CardDescription>
        </div>
        {hasOthers && (
          <Button variant="outline" onClick={() => setConfirmOpen(true)} className="shrink-0">
            <LogOut />
            {t('profile.sessions.revokeOthers')}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {sessionsQuery.isError ? (
          <ErrorState error={sessionsQuery.error} onRetry={() => void sessionsQuery.refetch()} />
        ) : (
          <SessionList
            sessions={sessionsQuery.data}
            loading={sessionsQuery.isLoading}
            revokingId={revokeOne.isPending ? revokeOne.variables : null}
            onRevoke={(session) => revokeOne.mutate(session.id)}
            emptyText={t('profile.sessions.empty')}
          />
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('profile.sessions.confirmTitle')}
        description={t('profile.sessions.confirmText')}
        confirmLabel={t('profile.sessions.revokeOthers')}
        variant="destructive"
        loading={revokeOthers.isPending}
        onConfirm={() => revokeOthers.mutate()}
      />
    </Card>
  );
}
