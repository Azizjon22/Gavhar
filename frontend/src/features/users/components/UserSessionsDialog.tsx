import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SessionList } from '@/features/auth/components/SessionList';
import { errorMessage } from '@/lib/error-message';
import { userKeys, usersApi } from '../api/users.api';
import type { User } from '../types/user.types';

interface UserSessionsDialogProps {
  user: User | null;
  onClose: () => void;
}

/** SUPER_ADMIN boshqa foydalanuvchining faol sessiyalarini ko'radi va yopadi. */
export function UserSessionsDialog({ user, onClose }: UserSessionsDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const userId = user?.id ?? '';

  const sessionsQuery = useQuery({
    queryKey: userKeys.sessions(userId),
    queryFn: () => usersApi.sessions(userId),
    enabled: user !== null,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: userKeys.sessions(userId) });

  const revokeOne = useMutation({
    mutationFn: (sessionId: string) => usersApi.revokeSession(userId, sessionId),
    onSuccess: async () => {
      await refresh();
      toast.success(t('sessions.revoked'));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const revokeAll = useMutation({
    mutationFn: () => usersApi.revokeAllSessions(userId),
    onSuccess: async () => {
      await refresh();
      toast.success(t('sessions.allRevoked'));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const hasSessions = (sessionsQuery.data?.length ?? 0) > 0;

  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('users.sessions.title')}</DialogTitle>
          <DialogDescription>
            {t('users.sessions.description', { name: user?.fullName ?? '' })}
          </DialogDescription>
        </DialogHeader>

        <SessionList
          sessions={sessionsQuery.data}
          loading={sessionsQuery.isLoading}
          revokingId={revokeOne.isPending ? revokeOne.variables : null}
          onRevoke={(session) => revokeOne.mutate(session.id)}
          emptyText={t('users.sessions.empty')}
        />

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.close')}
          </Button>
          {hasSessions && (
            <Button
              variant="destructive"
              loading={revokeAll.isPending}
              onClick={() => revokeAll.mutate()}
            >
              {t('users.sessions.revokeAll')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
