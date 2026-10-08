import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ellipsis, Pencil, Trash2, UserRoundPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { type Column, DataTable } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { PageHeader } from '@/components/shared/PageHeader';
import { Pagination } from '@/components/shared/Pagination';
import { SearchInput } from '@/components/shared/SearchInput';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePermissions } from '@/hooks/use-permissions';
import { errorMessage } from '@/lib/error-message';
import { formatDate } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import { clientKeys, clientsApi } from '../api/clients.api';
import { ClientFormDialog } from '../components/ClientFormDialog';
import type { Client } from '../types/client.types';

const PAGE_SIZE = 15;

type DialogState = { type: 'form'; client?: Client } | { type: 'delete'; client: Client } | null;

function PhoneLink({ phone }: { phone: string }) {
  return (
    <a
      href={`tel:${phone}`}
      className="tabular rounded whitespace-nowrap underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/40"
    >
      {formatPhone(phone)}
    </a>
  );
}

export function ClientsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canUpdate = can('clients:update');
  const canDelete = can('clients:delete');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<DialogState>(null);
  const debouncedSearch = useDebouncedValue(search.trim());

  const params = { page, limit: PAGE_SIZE, ...(debouncedSearch && { search: debouncedSearch }) };
  const clientsQuery = useQuery({
    queryKey: clientKeys.list(params),
    queryFn: () => clientsApi.list(params),
    placeholderData: keepPreviousData,
  });

  const deleteMutation = useMutation({
    mutationFn: (client: Client) => clientsApi.remove(client.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: clientKeys.all });
      toast.success(t('clients.toast.deleted'));
      setDialog(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const columns = useMemo<Column<Client>[]>(() => {
    const base: Column<Client>[] = [
      {
        id: 'client',
        header: t('clients.columns.client'),
        cell: (client) => (
          <div className="flex min-w-44 items-center gap-3 sm:min-w-56">
            <Avatar name={client.fullName} />
            <div className="min-w-0">
              <p className="truncate font-semibold">{client.fullName}</p>
              {client.note && (
                <p className="line-clamp-1 max-w-xs text-xs text-muted-foreground">{client.note}</p>
              )}
              {/* Telefonda "Telefon" ustuni yashirin — raqam shu yerda. */}
              <p className="mt-0.5 text-sm sm:hidden">
                <PhoneLink phone={client.phone} />
              </p>
            </div>
          </div>
        ),
      },
      {
        id: 'phone',
        header: t('clients.columns.phone'),
        className: 'hidden sm:table-cell',
        cell: (client) => (
          <div className="grid gap-0.5 text-sm">
            <PhoneLink phone={client.phone} />
            {client.phoneExtra && (
              <span className="text-muted-foreground">
                <PhoneLink phone={client.phoneExtra} />
              </span>
            )}
          </div>
        ),
      },
      {
        id: 'createdAt',
        header: t('clients.columns.createdAt'),
        className: 'hidden md:table-cell',
        cell: (client) => (
          <span className="tabular text-sm whitespace-nowrap text-muted-foreground">
            {formatDate(client.createdAt)}
          </span>
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
        cell: (client) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('clients.actionsLabel', { name: client.fullName })}
              >
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canUpdate && (
                <DropdownMenuItem onSelect={() => setDialog({ type: 'form', client })}>
                  <Pencil />
                  {t('common.edit')}
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setDialog({ type: 'delete', client })}
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
  }, [t, canUpdate, canDelete]);

  const deleting = dialog?.type === 'delete' ? dialog.client : null;
  const openCreate = () => setDialog({ type: 'form' });

  return (
    <>
      <PageHeader
        title={t('clients.title')}
        description={t('clients.description')}
        actions={
          can('clients:create') && (
            <Button onClick={openCreate}>
              <UserRoundPlus />
              {t('clients.new')}
            </Button>
          )
        }
      />

      <Card className="overflow-hidden">
        <div className="border-b p-4">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder={t('clients.searchPlaceholder')}
            className="sm:max-w-sm"
          />
        </div>

        {clientsQuery.isError ? (
          <ErrorState error={clientsQuery.error} onRetry={() => void clientsQuery.refetch()} />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={clientsQuery.data?.items}
              rowKey={(client) => client.id}
              loading={clientsQuery.isLoading}
              empty={
                debouncedSearch ? (
                  <EmptyState
                    title={t('common.noResults.title')}
                    description={t('common.noResults.text')}
                  />
                ) : (
                  <EmptyState
                    title={t('clients.empty.title')}
                    description={t('clients.empty.text')}
                    action={
                      can('clients:create') && (
                        <Button onClick={openCreate}>
                          <UserRoundPlus />
                          {t('clients.new')}
                        </Button>
                      )
                    }
                  />
                )
              }
            />
            <Pagination meta={clientsQuery.data?.meta} onPageChange={setPage} />
          </>
        )}
      </Card>

      <ClientFormDialog
        open={dialog?.type === 'form'}
        onOpenChange={(open) => !open && setDialog(null)}
        client={dialog?.type === 'form' ? dialog.client : undefined}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t('clients.confirm.deleteTitle')}
        description={t('clients.confirm.deleteText', { name: deleting?.fullName ?? '' })}
        confirmLabel={t('common.delete')}
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
      />
    </>
  );
}
