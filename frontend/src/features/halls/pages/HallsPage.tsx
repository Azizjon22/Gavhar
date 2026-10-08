import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Images, Pencil, Plus, Trash2, Users, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/hooks/use-permissions';
import { errorMessage } from '@/lib/error-message';
import { hallKeys, hallsApi } from '../api/halls.api';
import { HallFormDialog } from '../components/HallFormDialog';
import type { Hall } from '../types/hall.types';

type DialogState = { type: 'form'; hallId?: string } | { type: 'delete'; hall: Hall } | null;

export function HallsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const [dialog, setDialog] = useState<DialogState>(null);

  const hallsQuery = useQuery({ queryKey: hallKeys.list, queryFn: hallsApi.list });
  const halls = hallsQuery.data;

  const deleteMutation = useMutation({
    mutationFn: (hall: Hall) => hallsApi.remove(hall.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: hallKeys.all });
      toast.success(t('halls.toast.deleted'));
      setDialog(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  // Tahrirlanayotgan zal ro'yxatdan olinadi — rasm qo'shilganda dialog ham yangilanadi.
  const editing =
    dialog?.type === 'form' && dialog.hallId
      ? halls?.find((hall) => hall.id === dialog.hallId)
      : undefined;
  const deleting = dialog?.type === 'delete' ? dialog.hall : null;
  const openCreate = () => setDialog({ type: 'form' });

  const createButton = can('halls:create') && (
    <Button onClick={openCreate}>
      <Plus />
      {t('halls.new')}
    </Button>
  );

  return (
    <>
      <PageHeader
        title={t('halls.title')}
        description={t('halls.description')}
        actions={createButton}
      />

      {hallsQuery.isError ? (
        <Card>
          <ErrorState error={hallsQuery.error} onRetry={() => void hallsQuery.refetch()} />
        </Card>
      ) : !halls ? (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-[380px] rounded-2xl" />
          ))}
        </div>
      ) : halls.length === 0 ? (
        <Card>
          <EmptyState
            title={t('halls.empty.title')}
            description={t('halls.empty.text')}
            action={createButton}
          />
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {halls.map((hall) => (
            <HallCard
              key={hall.id}
              hall={hall}
              onEdit={
                can('halls:update') ? () => setDialog({ type: 'form', hallId: hall.id }) : undefined
              }
              onDelete={can('halls:delete') ? () => setDialog({ type: 'delete', hall }) : undefined}
            />
          ))}
        </div>
      )}

      <HallFormDialog
        open={dialog?.type === 'form'}
        onOpenChange={(open) => !open && setDialog(null)}
        hall={editing}
        onCreated={(hall) => setDialog({ type: 'form', hallId: hall.id })}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t('halls.confirm.deleteTitle')}
        description={t('halls.confirm.deleteText', { name: deleting?.name ?? '' })}
        confirmLabel={t('common.delete')}
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
      />
    </>
  );
}

interface HallCardProps {
  hall: Hall;
  /** Ruxsat bo'lmasa `undefined` — tugma ko'rsatilmaydi. */
  onEdit?: () => void;
  onDelete?: () => void;
}

function HallCard({ hall, onEdit, onDelete }: HallCardProps) {
  const { t } = useTranslation();
  const cover = hall.images[0];
  const inMaintenance = hall.status === 'MAINTENANCE';

  return (
    <Card className="group flex flex-col overflow-hidden transition-shadow hover:shadow-lifted">
      <div className="relative aspect-[16/10] overflow-hidden bg-muted">
        {cover ? (
          <img
            src={cover.thumbUrl}
            alt={hall.name}
            loading="lazy"
            className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="bg-sidebar-gradient flex size-full items-center justify-center">
            <Building2 className="size-14 text-gold-light/50" strokeWidth={1.2} />
          </div>
        )}
        <div
          className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent"
          aria-hidden="true"
        />
        <Badge
          variant={inMaintenance ? 'warning' : 'success'}
          className="absolute top-3 left-3 bg-card/90 backdrop-blur"
        >
          {inMaintenance && <Wrench />}
          {t(`halls.status.${hall.status}`)}
        </Badge>
        {hall.images.length > 1 && (
          <span className="tabular absolute right-3 bottom-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
            <Images className="size-3.5" />
            {hall.images.length}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-6">
        <h2 className="truncate font-display text-2xl font-semibold tracking-tight">{hall.name}</h2>
        <p className="mt-1.5 line-clamp-2 min-h-[46px] text-sm leading-relaxed text-muted-foreground">
          {hall.description ?? t('halls.noDescription')}
        </p>

        <p className="mt-4 flex items-center gap-2 rounded-xl bg-muted/60 px-3.5 py-3 text-sm">
          <Users className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">{t('halls.capacity')}:</span>
          <span className="tabular font-bold">{t('halls.guests', { count: hall.capacity })}</span>
        </p>

        {(onEdit || onDelete) && (
          <div className="mt-5 flex items-center gap-2 border-t pt-4">
            {onEdit && (
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Pencil />
                {t('common.edit')}
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 />
                {t('common.delete')}
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
