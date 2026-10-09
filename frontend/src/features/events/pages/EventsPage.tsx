import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarDays, List, Plus, Settings2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { type Column, DataTable } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { PageHeader } from '@/components/shared/PageHeader';
import { Pagination } from '@/components/shared/Pagination';
import { SearchInput } from '@/components/shared/SearchInput';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePermissions } from '@/hooks/use-permissions';
import { formatDate, formatTime } from '@/lib/format';
import { formatAmount } from '@/lib/money';
import { eventKeys, eventsApi } from '../api/events.api';
import { BookingSettingsDialog } from '../components/BookingSettingsDialog';
import { EventCalendar } from '../components/EventCalendar';
import { EventFormDialog } from '../components/EventFormDialog';
import { EventStatusBadge } from '../components/EventStatusBadge';
import {
  EVENT_STATUSES,
  type EventStatus,
  type EventSummary,
  type ListEventsParams,
} from '../types/event.types';

const PAGE_SIZE = 15;
const ALL = 'all';
type ViewTab = 'list' | 'calendar';

export function EventsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: ViewTab = searchParams.get('view') === 'calendar' ? 'calendar' : 'list';

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<EventStatus | typeof ALL>(ALL);
  const [debtOnly, setDebtOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<{ open: boolean; date?: string }>({ open: false });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const debouncedSearch = useDebouncedValue(search.trim());

  const params: ListEventsParams = {
    page,
    limit: PAGE_SIZE,
    sortBy: 'startAt',
    sortOrder: 'desc',
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(status !== ALL && { status }),
    ...(debtOnly && { debtOnly: true }),
  };
  const listQuery = useQuery({
    queryKey: eventKeys.list(params),
    queryFn: () => eventsApi.list(params),
    placeholderData: keepPreviousData,
    enabled: tab === 'list',
  });

  // Summa va qarz faqat moliya ruxsati bor foydalanuvchiga ko'rinadi.
  const showMoney = can('finance:read');
  const columns = useMemo<Column<EventSummary>[]>(
    () => [
      {
        id: 'event',
        header: t('events.columns.event'),
        cell: (event) => (
          <div className="min-w-40">
            <p className="font-semibold">
              <span className="tabular text-muted-foreground">№ {event.number}</span>{' '}
              {event.title ?? t(`events.type.${event.type}`)}
            </p>
            <p className="truncate text-xs text-muted-foreground">{event.client.fullName}</p>
            <div className="mt-1 md:hidden">
              <EventStatusBadge status={event.status} />
            </div>
          </div>
        ),
      },
      {
        id: 'date',
        header: t('events.columns.date'),
        cell: (event) => (
          <div className="tabular text-sm whitespace-nowrap">
            <p className="font-medium">{formatDate(event.startAt)}</p>
            <p className="text-xs text-muted-foreground">
              {formatTime(event.startAt)}–{formatTime(event.endAt)}
            </p>
          </div>
        ),
      },
      {
        id: 'guests',
        header: t('events.columns.guests'),
        className: 'hidden lg:table-cell',
        cell: (event) => <span className="tabular text-sm">{event.guestCount}</span>,
      },
      ...(showMoney
        ? [
            {
              id: 'amount',
              header: t('events.columns.amount'),
              className: 'hidden text-right sm:table-cell',
              cell: (event: EventSummary) => (
                <div className="tabular text-sm whitespace-nowrap">
                  <p className="font-semibold">{formatAmount(event.totalAmount)}</p>
                  {Number(event.debt) > 0 && event.status !== 'CANCELLED' && (
                    <p className="text-xs font-medium text-destructive">
                      {t('events.debt', { amount: formatAmount(event.debt) })}
                    </p>
                  )}
                </div>
              ),
            },
          ]
        : []),
      {
        id: 'status',
        header: t('events.columns.status'),
        className: 'hidden md:table-cell',
        cell: (event) => <EventStatusBadge status={event.status} />,
      },
    ],
    [t, showMoney],
  );

  const hasFilters = debouncedSearch !== '' || status !== ALL || debtOnly;
  const canCreate = can('events:create');
  const openCreate = (date?: string) => setForm({ open: true, date });
  const createButton = canCreate && (
    <Button onClick={() => openCreate()}>
      <Plus />
      {t('events.new')}
    </Button>
  );

  return (
    <>
      <PageHeader
        title={t('events.title')}
        description={t('events.description')}
        actions={
          <>
            {can('settings:update') && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={t('events.settings.title')}
                    onClick={() => setSettingsOpen(true)}
                  >
                    <Settings2 />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('events.settings.title')}</TooltipContent>
              </Tooltip>
            )}
            {createButton}
          </>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(value) => setSearchParams({ view: value }, { replace: true })}
      >
        <TabsList>
          <TabsTrigger value="list">
            <List />
            {t('events.views.list')}
          </TabsTrigger>
          <TabsTrigger value="calendar">
            <CalendarDays />
            {t('events.views.calendar')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center">
              <SearchInput
                value={search}
                onChange={(value) => {
                  setSearch(value);
                  setPage(1);
                }}
                placeholder={t('events.searchPlaceholder')}
                className="lg:max-w-sm lg:flex-1"
              />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:ml-auto">
                {showMoney && (
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
                    <Checkbox
                      checked={debtOnly}
                      onCheckedChange={(checked) => {
                        setDebtOnly(checked === true);
                        setPage(1);
                      }}
                    />
                    {t('events.filters.debtOnly')}
                  </label>
                )}
                <Select
                  value={status}
                  onValueChange={(value) => {
                    setStatus(value as EventStatus | typeof ALL);
                    setPage(1);
                  }}
                >
                  <SelectTrigger aria-label={t('events.filters.status')} className="sm:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{t('events.filters.allStatuses')}</SelectItem>
                    {EVENT_STATUSES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`events.status.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {listQuery.isError ? (
              <ErrorState error={listQuery.error} onRetry={() => void listQuery.refetch()} />
            ) : (
              <>
                <DataTable
                  columns={columns}
                  rows={listQuery.data?.items}
                  rowKey={(event) => event.id}
                  loading={listQuery.isLoading}
                  onRowClick={(event) => navigate(`/events/${event.id}`)}
                  empty={
                    hasFilters ? (
                      <EmptyState
                        title={t('common.noResults.title')}
                        description={t('common.noResults.text')}
                      />
                    ) : (
                      <EmptyState
                        title={t('events.empty.title')}
                        description={t('events.empty.text')}
                        action={createButton}
                      />
                    )
                  }
                />
                <Pagination meta={listQuery.data?.meta} onPageChange={setPage} />
              </>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="calendar">
          <Card className="overflow-hidden">
            <EventCalendar onCreate={canCreate ? openCreate : undefined} />
          </Card>
        </TabsContent>
      </Tabs>

      <EventFormDialog
        open={form.open}
        onOpenChange={(open) => setForm((current) => ({ ...current, open }))}
        defaultDate={form.date}
        onSaved={(event) => navigate(`/events/${event.id}`)}
      />
      <BookingSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
