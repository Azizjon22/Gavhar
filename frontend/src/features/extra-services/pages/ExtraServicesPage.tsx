import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ellipsis, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { type Column, DataTable } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePermissions } from '@/hooks/use-permissions';
import { errorMessage } from '@/lib/error-message';
import { formatAmount } from '@/lib/money';
import { cn } from '@/lib/utils';
import { extraServiceKeys, extraServicesApi } from '../api/extra-services.api';
import { ExtraServiceFormDialog } from '../components/ExtraServiceFormDialog';
import type { ExtraService } from '../types/extra-service.types';

type DialogState =
  { type: 'form'; service?: ExtraService } | { type: 'delete'; service: ExtraService } | null;

export function ExtraServicesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const canManage = usePermissions().can('events:update');
  const [dialog, setDialog] = useState<DialogState>(null);

  const query = useQuery({ queryKey: extraServiceKeys.list, queryFn: extraServicesApi.list });
  const refresh = () => queryClient.invalidateQueries({ queryKey: extraServiceKeys.all });
  const onError = (error: unknown) => toast.error(errorMessage(error));

  const toggleMutation = useMutation({
    mutationFn: (service: ExtraService) =>
      extraServicesApi.update(service.id, { isActive: !service.isActive }),
    onSuccess: refresh,
    onError,
  });
  const deleteMutation = useMutation({
    mutationFn: (service: ExtraService) => extraServicesApi.remove(service.id),
    onSuccess: async () => {
      await refresh();
      toast.success(t('services.toast.deleted'));
      setDialog(null);
    },
    onError,
  });

  const { mutate: toggle } = toggleMutation;
  const columns = useMemo<Column<ExtraService>[]>(() => {
    const base: Column<ExtraService>[] = [
      {
        id: 'name',
        header: t('services.columns.name'),
        cell: (service) => (
          <div className={cn('min-w-40', !service.isActive && 'opacity-60')}>
            <p className="font-semibold">{service.name}</p>
            <p className="text-xs text-muted-foreground sm:hidden">
              {t(`services.unit.${service.unit}`)}
            </p>
          </div>
        ),
      },
      {
        id: 'unit',
        header: t('services.columns.unit'),
        className: 'hidden sm:table-cell',
        cell: (service) => (
          <span className="text-sm text-muted-foreground">
            {t(`services.unit.${service.unit}`)}
          </span>
        ),
      },
      {
        id: 'price',
        header: t('services.columns.price'),
        className: 'text-right',
        cell: (service) => (
          <span className="tabular font-semibold whitespace-nowrap">
            {formatAmount(service.price)}{' '}
            <span className="text-xs font-medium text-muted-foreground">
              {t('common.currency')}
            </span>
          </span>
        ),
      },
      {
        id: 'status',
        header: t('services.columns.status'),
        className: 'hidden md:table-cell',
        cell: (service) => (
          <Badge variant={service.isActive ? 'success' : 'secondary'}>
            {t(service.isActive ? 'services.active' : 'services.inactive')}
          </Badge>
        ),
      },
    ];
    if (!canManage) return base;

    return [
      ...base,
      {
        id: 'actions',
        header: <span className="sr-only">{t('common.actions')}</span>,
        className: 'w-12 text-right',
        cell: (service) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('services.actionsLabel', { name: service.name })}
              >
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setDialog({ type: 'form', service })}>
                <Pencil />
                {t('common.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => toggle(service)}>
                {service.isActive ? <EyeOff /> : <Eye />}
                {t(service.isActive ? 'services.deactivate' : 'services.activate')}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setDialog({ type: 'delete', service })}
              >
                <Trash2 />
                {t('common.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ];
  }, [t, canManage, toggle]);

  const deleting = dialog?.type === 'delete' ? dialog.service : null;
  const createButton = canManage && (
    <Button onClick={() => setDialog({ type: 'form' })}>
      <Plus />
      {t('services.new')}
    </Button>
  );

  return (
    <>
      <PageHeader
        title={t('services.title')}
        description={t('services.description')}
        actions={createButton}
      />
      <Card className="overflow-hidden">
        {query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            rows={query.data}
            rowKey={(service) => service.id}
            loading={query.isLoading}
            skeletonRows={4}
            empty={
              <EmptyState
                title={t('services.empty.title')}
                description={t('services.empty.text')}
                action={createButton}
              />
            }
          />
        )}
      </Card>

      <ExtraServiceFormDialog
        open={dialog?.type === 'form'}
        onOpenChange={(open) => !open && setDialog(null)}
        service={dialog?.type === 'form' ? dialog.service : undefined}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t('services.confirm.deleteTitle')}
        description={t('services.confirm.deleteText', { name: deleting?.name ?? '' })}
        confirmLabel={t('common.delete')}
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
      />
    </>
  );
}
