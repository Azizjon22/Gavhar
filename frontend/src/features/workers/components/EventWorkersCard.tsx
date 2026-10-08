import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ErrorState } from '@/components/shared/ErrorState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/hooks/use-permissions';
import { errorMessage } from '@/lib/error-message';
import { formatPhone } from '@/lib/phone';
import { workerKeys, workersApi } from '../api/workers.api';
import { WorkerAvatar } from './WorkerAvatar';

interface Props {
  eventId: string;
  /** Bekor qilingan bronga ishchi biriktirilmaydi. */
  locked?: boolean;
}

/** To'yga biriktirilgan ishchilar: kim, qaysi vazifada. Zavzal yoki admin biriktiradi. */
export function EventWorkersCard({ eventId, locked = false }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const canAssign = usePermissions().can('staff:update') && !locked;
  const [adding, setAdding] = useState(false);
  const [workerId, setWorkerId] = useState('');
  const [role, setRole] = useState('');

  const query = useQuery({
    queryKey: workerKeys.event(eventId),
    queryFn: () => workersApi.forEvent(eventId),
  });
  const workersQuery = useQuery({
    queryKey: workerKeys.list,
    queryFn: workersApi.list,
    enabled: adding,
  });

  const done = (message: string) => async () => {
    await queryClient.invalidateQueries({ queryKey: workerKeys.all });
    toast.success(message);
    setAdding(false);
  };
  const onError = (error: unknown) => toast.error(errorMessage(error));
  const assignMutation = useMutation({
    mutationFn: () => workersApi.assign(eventId, { workerId, roleAtEvent: role.trim() || null }),
    onSuccess: done(t('workers.toast.assigned')),
    onError,
  });
  const unassignMutation = useMutation({
    mutationFn: (id: string) => workersApi.unassign(eventId, id),
    onSuccess: done(t('workers.toast.unassigned')),
    onError,
  });

  const assigned = new Set((query.data ?? []).map((item) => item.worker.id));
  const available = (workersQuery.data ?? []).filter(
    (worker) => worker.isActive && !assigned.has(worker.id),
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>
          {t('workers.eventCard.title')}
          {query.data && query.data.length > 0 && (
            <span className="tabular ml-2 text-base font-normal text-muted-foreground">
              {query.data.length}
            </span>
          )}
        </CardTitle>
        {canAssign && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setWorkerId('');
              setRole('');
              setAdding(true);
            }}
          >
            <Plus />
            {t('workers.eventCard.assign')}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : !query.data ? (
          <Skeleton className="h-16 rounded-xl" />
        ) : query.data.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
            {t('workers.eventCard.empty')}
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {query.data.map(({ worker, roleAtEvent }) => (
              <li key={worker.id} className="flex items-center gap-3 rounded-xl border p-2.5">
                <WorkerAvatar worker={worker} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{worker.fullName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {roleAtEvent ?? t(`workers.position.${worker.position}`)} ·{' '}
                    <span className="tabular">{formatPhone(worker.phone)}</span>
                  </p>
                </div>
                {canAssign && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('workers.eventCard.remove', { name: worker.fullName })}
                    className="text-muted-foreground hover:text-destructive"
                    disabled={unassignMutation.isPending}
                    onClick={() => unassignMutation.mutate(worker.id)}
                  >
                    <X />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={adding} onOpenChange={(open) => !assignMutation.isPending && setAdding(open)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t('workers.eventCard.assign')}</DialogTitle>
            <DialogDescription>{t('workers.eventCard.assignDescription')}</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (workerId) assignMutation.mutate();
            }}
          >
            <div className="grid content-start gap-2">
              <Label htmlFor="assign-worker">{t('workers.eventCard.worker')}</Label>
              <Select value={workerId} onValueChange={setWorkerId}>
                <SelectTrigger id="assign-worker">
                  <SelectValue placeholder={t('workers.eventCard.workerPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {available.map((worker) => (
                    <SelectItem key={worker.id} value={worker.id}>
                      {worker.fullName} · {t(`workers.position.${worker.position}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {workersQuery.data && available.length === 0 && (
                <p className="text-xs text-muted-foreground">{t('workers.eventCard.noneLeft')}</p>
              )}
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="assign-role">
                {t('workers.eventCard.role')}{' '}
                <span className="font-normal text-muted-foreground">({t('common.optional')})</span>
              </Label>
              <Input
                id="assign-role"
                value={role}
                maxLength={80}
                placeholder={t('workers.eventCard.rolePlaceholder')}
                onChange={(event) => setRole(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setAdding(false)}
                disabled={assignMutation.isPending}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={assignMutation.isPending} disabled={!workerId}>
                {t('workers.eventCard.assign')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
