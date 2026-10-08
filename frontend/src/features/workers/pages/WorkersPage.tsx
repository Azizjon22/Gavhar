import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ellipsis,
  Image as ImageIcon,
  ImageOff,
  Pencil,
  Plus,
  Trash2,
  UserCheck,
  UserX,
} from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { type Column, DataTable } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermissions } from '@/hooks/use-permissions';
import { errorMessage } from '@/lib/error-message';
import { formatPhone } from '@/lib/phone';
import { cn } from '@/lib/utils';
import { workerKeys, workersApi } from '../api/workers.api';
import { WorkerAvatar } from '../components/WorkerAvatar';
import { WorkerFormDialog } from '../components/WorkerFormDialog';
import { WORKER_POSITIONS, type Worker, type WorkerPosition } from '../types/worker.types';

const ALL = 'ALL';
type Filter = WorkerPosition | typeof ALL;

type DialogState = { type: 'form'; worker?: Worker } | { type: 'delete'; worker: Worker } | null;

/** Ishchilar: ofitsiant, oshpaz va boshqalar ro'yxati. To'yga biriktirish bron sahifasida. */
export function WorkersPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canCreate = can('staff:create');
  const canUpdate = can('staff:update');
  const canDelete = can('staff:delete');

  const [filter, setFilter] = useState<Filter>(ALL);
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<DialogState>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const photoTarget = useRef<Worker | null>(null);

  const query = useQuery({ queryKey: workerKeys.list, queryFn: workersApi.list });
  const refresh = () => queryClient.invalidateQueries({ queryKey: workerKeys.all });
  const onError = (error: unknown) => toast.error(errorMessage(error));

  const patchMutation = useMutation({
    mutationFn: (input: {
      worker: Worker;
      file?: File;
      isActive?: boolean;
      removePhoto?: boolean;
    }) => {
      if (input.file) return workersApi.uploadPhoto(input.worker.id, input.file);
      if (input.removePhoto) return workersApi.removePhoto(input.worker.id);
      return workersApi.update(input.worker.id, { isActive: input.isActive });
    },
    onSuccess: refresh,
    onError,
  });
  const { mutate: patchWorker } = patchMutation;
  const deleteMutation = useMutation({
    mutationFn: (worker: Worker) => workersApi.remove(worker.id),
    onSuccess: async () => {
      await refresh();
      toast.success(t('workers.toast.deleted'));
      setDialog(null);
    },
    onError,
  });
  const pickPhoto = useCallback((worker: Worker) => {
    photoTarget.current = worker;
    fileInput.current?.click();
  }, []);

  const all = query.data;
  const needle = search.trim().toLowerCase();
  const rows = all?.filter(
    (worker) =>
      (filter === ALL || worker.position === filter) &&
      (needle === '' ||
        worker.fullName.toLowerCase().includes(needle) ||
        worker.phone.includes(needle.replace(/\s/g, ''))),
  );

  const columns = useMemo<Column<Worker>[]>(() => {
    const base: Column<Worker>[] = [
      {
        id: 'worker',
        header: t('workers.columns.worker'),
        cell: (worker) => (
          <div className={cn('flex items-center gap-3', !worker.isActive && 'opacity-60')}>
            <WorkerAvatar worker={worker} />
            <div className="min-w-0">
              <p className="font-semibold">{worker.fullName}</p>
              <p className="text-xs text-muted-foreground">
                <span className="md:hidden">{t(`workers.position.${worker.position}`)} · </span>
                {worker.note}
              </p>
            </div>
          </div>
        ),
      },
      {
        id: 'position',
        header: t('workers.columns.position'),
        className: 'hidden md:table-cell',
        cell: (worker) => (
          <Badge variant={worker.position === 'CHEF' ? 'gold' : 'secondary'}>
            {t(`workers.position.${worker.position}`)}
          </Badge>
        ),
      },
      {
        id: 'phone',
        header: t('workers.columns.phone'),
        cell: (worker) => (
          <a
            href={`tel:${worker.phone}`}
            className="tabular text-sm whitespace-nowrap hover:underline"
          >
            {formatPhone(worker.phone)}
          </a>
        ),
      },
      {
        id: 'events',
        header: t('workers.columns.upcoming'),
        className: 'hidden text-right lg:table-cell',
        cell: (worker) => <span className="tabular text-sm">{worker.upcomingEvents ?? 0}</span>,
      },
      {
        id: 'status',
        header: t('workers.columns.status'),
        className: 'hidden sm:table-cell',
        cell: (worker) => (
          <Badge variant={worker.isActive ? 'success' : 'secondary'}>
            {t(worker.isActive ? 'workers.active' : 'workers.inactive')}
          </Badge>
        ),
      },
    ];
    if (!canUpdate && !canDelete) return base;

    return [
      ...base,
      {
        id: 'actions',
        header: <span className="sr-only">{t('common.actions')}</span>,
        className: 'w-12 text-right',
        cell: (worker) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('workers.actionsLabel', { name: worker.fullName })}
              >
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canUpdate && (
                <>
                  <DropdownMenuItem onSelect={() => setDialog({ type: 'form', worker })}>
                    <Pencil />
                    {t('common.edit')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => pickPhoto(worker)}>
                    <ImageIcon />
                    {t(worker.photo ? 'warehouse.photo.replace' : 'warehouse.photo.upload')}
                  </DropdownMenuItem>
                  {worker.photo && (
                    <DropdownMenuItem onSelect={() => patchWorker({ worker, removePhoto: true })}>
                      <ImageOff />
                      {t('warehouse.photo.remove')}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onSelect={() => patchWorker({ worker, isActive: !worker.isActive })}
                  >
                    {worker.isActive ? <UserX /> : <UserCheck />}
                    {t(worker.isActive ? 'workers.deactivate' : 'workers.activate')}
                  </DropdownMenuItem>
                </>
              )}
              {canDelete && (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setDialog({ type: 'delete', worker })}
                >
                  <Trash2 />
                  {t('common.delete')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ];
  }, [t, canUpdate, canDelete, pickPhoto, patchWorker]);

  const deleting = dialog?.type === 'delete' ? dialog.worker : null;
  const createButton = canCreate && (
    <Button onClick={() => setDialog({ type: 'form' })}>
      <Plus />
      {t('workers.new')}
    </Button>
  );

  return (
    <>
      <PageHeader
        title={t('workers.title')}
        description={t('workers.description')}
        actions={createButton}
      />
      <input
        ref={fileInput}
        type="file"
        hidden
        accept="image/jpeg,image/png,image/webp,image/avif"
        onChange={(event) => {
          const file = event.target.files?.[0];
          const worker = photoTarget.current;
          event.target.value = '';
          if (file && worker) patchWorker({ worker, file });
        }}
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="overflow-x-auto">
          <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
            <TabsList>
              <TabsTrigger value={ALL}>
                {t('workers.all')}
                {all && <span className="tabular ml-1 opacity-60">{all.length}</span>}
              </TabsTrigger>
              {WORKER_POSITIONS.map((position) => (
                <TabsTrigger key={position} value={position}>
                  {t(`workers.positionPlural.${position}`)}
                  {all && (
                    <span className="tabular ml-1 opacity-60">
                      {all.filter((worker) => worker.position === position).length}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('workers.searchPlaceholder')}
          className="lg:w-72"
        />
      </div>

      <Card className="overflow-hidden">
        {query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(worker) => worker.id}
            loading={query.isLoading}
            skeletonRows={5}
            empty={
              all && all.length > 0 ? (
                <EmptyState
                  title={t('common.noResults.title')}
                  description={t('common.noResults.text')}
                />
              ) : (
                <EmptyState
                  title={t('workers.empty.title')}
                  description={t('workers.empty.text')}
                  action={createButton}
                />
              )
            }
          />
        )}
      </Card>

      <WorkerFormDialog
        open={dialog?.type === 'form'}
        onOpenChange={(open) => !open && setDialog(null)}
        worker={dialog?.type === 'form' ? dialog.worker : undefined}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t('workers.confirm.deleteTitle')}
        description={t('workers.confirm.deleteText', { name: deleting?.fullName ?? '' })}
        confirmLabel={t('common.delete')}
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
      />
    </>
  );
}
