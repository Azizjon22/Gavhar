import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type Column, DataTable } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { PageHeader } from '@/components/shared/PageHeader';
import { Pagination } from '@/components/shared/Pagination';
import { SearchInput } from '@/components/shared/SearchInput';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { dayEndIso, dayStartIso, formatDateTime } from '@/lib/format';
import { auditApi, auditKeys } from '../api/audit.api';
import { AuditDetailDialog } from '../components/AuditDetailDialog';
import type { AuditLog, ListAuditLogsParams } from '../types/audit.types';

const PAGE_SIZE = 20;
const ALL = 'all';
/** Amal nomining boshlanishi bo'yicha filtr (`auth.login`, `user.create`, ...). */
const CATEGORIES = [
  'auth',
  'user',
  'role',
  'session',
  'event',
  'payment',
  'client',
  'hall',
  'menu',
  'gallery',
  'expense',
  'warehouse',
  'shopping',
  'worker',
] as const;
const ALERT_ACTIONS = new Set([
  'auth.login_failed',
  'auth.token_reuse',
  'user.delete',
  'user.block',
]);

const actionVariant = (action: string): BadgeProps['variant'] => {
  if (ALERT_ACTIONS.has(action)) return 'destructive';
  if (action.startsWith('auth.')) return 'default';
  if (action.startsWith('user.')) return 'gold';
  return 'secondary';
};

export function AuditLogPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>(ALL);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const debouncedSearch = useDebouncedValue(search.trim());

  const params: ListAuditLogsParams = {
    page,
    limit: PAGE_SIZE,
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(category !== ALL && { action: `${category}.` }),
    ...(from && { from: dayStartIso(from) }),
    ...(to && { to: dayEndIso(to) }),
  };

  const logsQuery = useQuery({
    queryKey: auditKeys.list(params),
    queryFn: () => auditApi.list(params),
    placeholderData: keepPreviousData,
  });

  const actionLabel = useCallback(
    (action: string) => t(`audit.actions.${action}`, { defaultValue: action }),
    [t],
  );

  const updateFilter = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };

  const columns = useMemo<Column<AuditLog>[]>(
    () => [
      {
        id: 'time',
        header: t('audit.columns.time'),
        cell: (log) => (
          <span className="tabular text-sm whitespace-nowrap">{formatDateTime(log.createdAt)}</span>
        ),
      },
      {
        id: 'actor',
        header: t('audit.columns.actor'),
        cell: (log) => (
          <div className="min-w-28 sm:min-w-40">
            <p className="truncate font-medium">
              {log.actor?.fullName ?? log.actorEmail ?? t('audit.unknownActor')}
            </p>
            {log.actor && (
              <p className="truncate text-xs text-muted-foreground">{log.actor.email}</p>
            )}
          </div>
        ),
      },
      {
        id: 'action',
        header: t('audit.columns.action'),
        cell: (log) => <Badge variant={actionVariant(log.action)}>{actionLabel(log.action)}</Badge>,
      },
      {
        id: 'ip',
        header: t('audit.columns.ip'),
        className: 'hidden md:table-cell',
        cell: (log) => (
          <span className="tabular font-mono text-xs text-muted-foreground">{log.ip ?? '—'}</span>
        ),
      },
    ],
    [t, actionLabel],
  );

  const hasFilters = debouncedSearch !== '' || category !== ALL || from !== '' || to !== '';

  return (
    <>
      <PageHeader title={t('audit.title')} description={t('audit.description')} />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 xl:flex-row xl:items-center">
          <SearchInput
            value={search}
            onChange={updateFilter(setSearch)}
            placeholder={t('audit.searchPlaceholder')}
            className="xl:max-w-sm xl:flex-1"
          />
          <div className="flex flex-col gap-3 sm:flex-row xl:ml-auto">
            <Select value={category} onValueChange={updateFilter(setCategory)}>
              <SelectTrigger aria-label={t('audit.filters.category')} className="sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('audit.filters.allCategories')}</SelectItem>
                {CATEGORIES.map((key) => (
                  <SelectItem key={key} value={key}>
                    {t(`audit.categories.${key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(event) => updateFilter(setFrom)(event.target.value)}
                aria-label={t('audit.filters.from')}
                className="tabular sm:w-40"
              />
              <span className="text-muted-foreground" aria-hidden="true">
                —
              </span>
              <Input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => updateFilter(setTo)(event.target.value)}
                aria-label={t('audit.filters.to')}
                className="tabular sm:w-40"
              />
            </div>
          </div>
        </div>

        {logsQuery.isError ? (
          <ErrorState error={logsQuery.error} onRetry={() => void logsQuery.refetch()} />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={logsQuery.data?.items}
              rowKey={(log) => log.id}
              loading={logsQuery.isLoading}
              skeletonRows={8}
              onRowClick={setSelected}
              empty={
                <EmptyState
                  title={t(hasFilters ? 'common.noResults.title' : 'audit.empty.title')}
                  description={t(hasFilters ? 'common.noResults.text' : 'audit.empty.text')}
                />
              }
            />
            <Pagination meta={logsQuery.data?.meta} onPageChange={setPage} />
          </>
        )}
      </Card>

      <AuditDetailDialog
        log={selected}
        actionLabel={actionLabel}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
