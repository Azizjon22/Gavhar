import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  HandCoins,
  Info,
  type LucideIcon,
  Pencil,
  Plus,
  ShoppingBasket,
  Tags,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ROUTES } from '@/app/router/paths';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { type Column, DataTable } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { PageHeader } from '@/components/shared/PageHeader';
import { Pagination } from '@/components/shared/Pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EventStatusBadge } from '@/features/events/components/EventStatusBadge';
import { usePermissions } from '@/hooks/use-permissions';
import { errorMessage } from '@/lib/error-message';
import { formatDate, formatTime } from '@/lib/format';
import { formatAmount } from '@/lib/money';
import { cn } from '@/lib/utils';
import { financeApi, financeKeys } from '../api/finance.api';
import { CategoryManagerDialog } from '../components/CategoryManagerDialog';
import { ExpenseFormDialog } from '../components/ExpenseFormDialog';
import { FinanceChart } from '../components/FinanceChart';
import {
  PERIODS,
  type Period,
  canGoForward,
  periodLabel,
  periodRange,
  shiftPeriod,
  todayDate,
} from '../lib/period';
import type { Expense, FinanceEvent } from '../types/finance.types';

const EXPENSES_PER_PAGE = 10;

type DialogState =
  | { type: 'expense'; expense?: Expense }
  | { type: 'delete'; expense: Expense }
  | { type: 'categories' }
  | null;

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  amount: string | undefined;
  hint?: ReactNode;
  tone?: 'default' | 'positive' | 'negative' | 'highlight';
}

function StatCard({ icon: Icon, label, amount, hint, tone = 'default' }: StatCardProps) {
  const { t } = useTranslation();
  return (
    <Card
      className={cn(
        'relative overflow-hidden p-5',
        tone === 'highlight' && 'bg-sidebar-gradient border-sidebar-border text-white',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p
          className={cn(
            'text-sm font-medium',
            tone === 'highlight' ? 'text-white/70' : 'text-muted-foreground',
          )}
        >
          {label}
        </p>
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-xl',
            tone === 'highlight' ? 'bg-white/10 text-gold-light' : 'bg-muted text-muted-foreground',
            tone === 'positive' && 'bg-success/12 text-success',
            tone === 'negative' && 'bg-destructive/12 text-destructive',
          )}
        >
          <Icon className="size-[18px]" />
        </span>
      </div>
      {amount === undefined ? (
        <Skeleton className="mt-3 h-9 w-40" />
      ) : (
        <p
          className={cn(
            'tabular mt-2 font-display text-3xl font-semibold tracking-tight whitespace-nowrap',
            tone === 'highlight' && 'text-gold-gradient',
            tone === 'negative' && 'text-destructive',
          )}
        >
          {formatAmount(amount)}
          <span
            className={cn(
              'ml-1.5 font-sans text-xs font-medium',
              tone === 'highlight' ? 'text-white/60' : 'text-muted-foreground',
            )}
          >
            {t('common.currency')}
          </span>
        </p>
      )}
      {hint && (
        <p
          className={cn(
            'mt-1.5 text-xs leading-relaxed',
            tone === 'highlight' ? 'text-white/65' : 'text-muted-foreground',
          )}
        >
          {hint}
        </p>
      )}
    </Card>
  );
}

/**
 * Hisob-kitob: hafta, oy yoki yil bo'yicha tushum, xarajat va sof foyda.
 * Faqat bo'lib o'tgan to'ylar hisoblanadi — kelajakdagi bronlar alohida ko'rsatiladi.
 */
export function FinancePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const today = todayDate();

  const [period, setPeriod] = useState<Period>('month');
  const [anchor, setAnchor] = useState(today);
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<DialogState>(null);

  const range = periodRange(period, anchor);
  const expenseParams = { from: range.from, to: range.to, page, limit: EXPENSES_PER_PAGE };

  const summaryQuery = useQuery({
    queryKey: financeKeys.summary(range),
    queryFn: () => financeApi.summary(range),
    placeholderData: keepPreviousData,
  });
  const expensesQuery = useQuery({
    queryKey: financeKeys.expenses(expenseParams),
    queryFn: () => financeApi.expenses(expenseParams),
    placeholderData: keepPreviousData,
  });
  const categoriesQuery = useQuery({
    queryKey: financeKeys.categories,
    queryFn: financeApi.categories,
  });

  const deleteMutation = useMutation({
    mutationFn: (expense: Expense) => financeApi.removeExpense(expense.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: financeKeys.all });
      toast.success(t('finance.toast.expenseDeleted'));
      setDialog(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const move = (next: { period?: Period; anchor?: string }) => {
    if (next.period) setPeriod(next.period);
    if (next.anchor) setAnchor(next.anchor);
    setPage(1);
  };

  const summary = summaryQuery.data;
  const totals = summary?.totals;
  const profit = totals ? Number(totals.profit) : 0;
  const categories = categoriesQuery.data ?? [];
  const canEdit = can('finance:update');
  const canDelete = can('finance:delete');
  const currency = t('common.currency');

  const eventColumns = useMemo<Column<FinanceEvent>[]>(
    () => [
      {
        id: 'date',
        header: t('finance.events.date'),
        className: 'hidden sm:table-cell',
        cell: (event) => (
          <span className="tabular whitespace-nowrap">
            {formatDate(event.startAt)}
            <span className="ml-1.5 text-xs text-muted-foreground">
              {formatTime(event.startAt)}
            </span>
          </span>
        ),
      },
      {
        id: 'event',
        header: t('finance.events.event'),
        cell: (event) => (
          <div className="sm:min-w-40">
            <p className="tabular text-xs text-muted-foreground sm:hidden">
              {formatDate(event.startAt)}
            </p>
            <p className="font-semibold">
              № {event.number} · {event.title ?? t(`events.type.${event.type}`)}
            </p>
            <p className="text-xs text-muted-foreground">
              {event.clientName} · {event.hallName} ·{' '}
              {t('halls.guests', { count: event.guestCount })}
            </p>
          </div>
        ),
      },
      {
        id: 'status',
        header: t('events.columns.status'),
        className: 'hidden lg:table-cell',
        cell: (event) => <EventStatusBadge status={event.status} />,
      },
      {
        id: 'total',
        header: t('finance.events.total'),
        className: 'hidden text-right sm:table-cell',
        cell: (event) => (
          <span className="tabular whitespace-nowrap">{formatAmount(event.totalAmount)}</span>
        ),
      },
      {
        id: 'paid',
        header: t('finance.events.paid'),
        className: 'text-right',
        cell: (event) => (
          <div className="tabular whitespace-nowrap">
            <p className="font-semibold">{formatAmount(event.paidAmount)}</p>
            {Number(event.debt) > 0 && (
              <p className="text-xs font-medium text-destructive">
                {t('finance.events.debt', { amount: formatAmount(event.debt) })}
              </p>
            )}
          </div>
        ),
      },
      {
        id: 'expenses',
        header: t('finance.events.expenses'),
        className: 'hidden text-right md:table-cell',
        cell: (event) => (
          <span className="tabular whitespace-nowrap text-muted-foreground">
            {Number(event.expenses) > 0 ? `− ${formatAmount(event.expenses)}` : '—'}
          </span>
        ),
      },
      {
        id: 'profit',
        header: t('finance.events.profit'),
        className: 'text-right',
        cell: (event) => (
          <span
            className={cn(
              'tabular font-semibold whitespace-nowrap',
              Number(event.netProfit) < 0 && 'text-destructive',
            )}
          >
            {formatAmount(event.netProfit)}
          </span>
        ),
      },
    ],
    [t],
  );

  const expenseColumns = useMemo<Column<Expense>[]>(() => {
    const base: Column<Expense>[] = [
      {
        id: 'date',
        header: t('finance.expenseColumns.date'),
        className: 'hidden sm:table-cell',
        cell: (expense) => (
          <span className="tabular whitespace-nowrap">{formatDate(expense.date)}</span>
        ),
      },
      {
        id: 'category',
        header: t('finance.expenseColumns.category'),
        cell: (expense) => (
          <div className="sm:min-w-36">
            <p className="tabular text-xs text-muted-foreground sm:hidden">
              {formatDate(expense.date)}
            </p>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
              {expense.category.name}
              {expense.fromShopping && (
                <Badge variant="secondary" className="gap-1">
                  <ShoppingBasket className="size-3" />
                  {t('finance.fromShopping')}
                </Badge>
              )}
            </p>
            {(expense.event || expense.note) && (
              <p className="text-xs text-muted-foreground">
                {expense.event
                  ? `№ ${expense.event.number} · ${expense.event.title}${expense.note && !expense.fromShopping ? ` — ${expense.note}` : ''}`
                  : expense.note}
              </p>
            )}
          </div>
        ),
      },
      {
        id: 'author',
        header: t('finance.expenseColumns.author'),
        className: 'hidden lg:table-cell',
        cell: (expense) => (
          <span className="text-sm text-muted-foreground">{expense.createdByName ?? '—'}</span>
        ),
      },
      {
        id: 'amount',
        header: t('finance.expenseColumns.amount'),
        className: 'text-right',
        cell: (expense) => (
          <span className="tabular font-semibold whitespace-nowrap">
            {formatAmount(expense.amount)}
          </span>
        ),
      },
    ];
    if (!canEdit && !canDelete) return base;

    return [
      ...base,
      {
        id: 'actions',
        header: <span className="sr-only">{t('common.actions')}</span>,
        className: 'w-20 text-right',
        // Bozorlikdan yozilgan xarajat faqat Bozorlik bo'limida o'zgaradi.
        cell: (expense) =>
          expense.fromShopping ? null : (
            <div className="flex justify-end gap-0.5">
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('common.edit')}
                  onClick={() => setDialog({ type: 'expense', expense })}
                >
                  <Pencil />
                </Button>
              )}
              {canDelete && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('common.delete')}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDialog({ type: 'delete', expense })}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          ),
      },
    ];
  }, [t, canEdit, canDelete]);

  const deleting = dialog?.type === 'delete' ? dialog.expense : null;
  const addExpenseButton = can('finance:create') && (
    <Button onClick={() => setDialog({ type: 'expense' })}>
      <Plus />
      {t('finance.addExpense')}
    </Button>
  );
  const topCategory = Number(summary?.expensesByCategory[0]?.amount ?? 0);

  return (
    <>
      <PageHeader
        title={t('finance.title')}
        description={t('finance.description')}
        actions={
          <>
            {can('finance:manage-categories') && (
              <Button variant="outline" onClick={() => setDialog({ type: 'categories' })}>
                <Tags />
                {t('finance.categories.title')}
              </Button>
            )}
            {addExpenseButton}
          </>
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={period} onValueChange={(value) => move({ period: value as Period })}>
          <TabsList>
            {PERIODS.map((item) => (
              <TabsTrigger key={item} value={item}>
                {t(`finance.period.${item}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            aria-label={t('finance.prevPeriod')}
            onClick={() => move({ anchor: shiftPeriod(period, anchor, -1) })}
          >
            <ChevronLeft />
          </Button>
          <p
            aria-live="polite"
            className="min-w-44 flex-1 text-center font-display text-lg font-semibold sm:flex-none"
          >
            {periodLabel(period, anchor)}
          </p>
          <Button
            variant="outline"
            size="icon"
            aria-label={t('finance.nextPeriod')}
            disabled={!canGoForward(period, anchor, today)}
            onClick={() => move({ anchor: shiftPeriod(period, anchor, 1) })}
          >
            <ChevronRight />
          </Button>
          <Button
            variant="ghost"
            disabled={periodRange(period, today).from === range.from}
            onClick={() => move({ anchor: today })}
          >
            {t('finance.today')}
          </Button>
        </div>
      </div>

      {summaryQuery.isError ? (
        <Card>
          <ErrorState error={summaryQuery.error} onRetry={() => void summaryQuery.refetch()} />
        </Card>
      ) : (
        <div className={cn('grid gap-5', summaryQuery.isPlaceholderData && 'opacity-70')}>
          <p className="flex items-start gap-2.5 rounded-xl border border-gold/30 bg-gold/8 px-4 py-3 text-sm leading-relaxed">
            <Info className="mt-0.5 size-4 shrink-0 text-gold-dark dark:text-gold-light" />
            <span>
              {summary?.range.countedUntil
                ? t('finance.rule', { date: formatDate(summary.range.countedUntil) })
                : t('finance.ruleFuture')}
            </span>
          </p>

          {summary && summary.pendingShopping.count > 0 && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm leading-relaxed">
              <ShoppingBasket className="size-4 shrink-0 text-warning" />
              <span className="min-w-0 flex-1">
                {t('finance.pendingShopping', {
                  count: summary.pendingShopping.count,
                  amount: formatAmount(summary.pendingShopping.total),
                })}
              </span>
              {can('shopping:read') && (
                <Button asChild variant="outline" size="sm">
                  <Link to={ROUTES.shopping}>{t('nav.shopping')}</Link>
                </Button>
              )}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={profit < 0 ? TrendingDown : TrendingUp}
              label={t('finance.profit')}
              amount={totals?.profit}
              tone="highlight"
              hint={t('finance.profitHint')}
            />
            <StatCard
              icon={Wallet}
              label={t('finance.income')}
              amount={totals?.income}
              tone="positive"
              hint={
                totals &&
                (Number(totals.retainedDeposits) > 0
                  ? t('finance.incomeHintRetained', {
                      count: totals.eventsCount,
                      amount: formatAmount(totals.retainedDeposits),
                    })
                  : t('finance.incomeHint', {
                      count: totals.eventsCount,
                      guests: totals.guestsCount,
                    }))
              }
            />
            <StatCard
              icon={TrendingDown}
              label={t('finance.expenses')}
              amount={totals?.expenses}
              hint={
                expensesQuery.data &&
                t('finance.expensesHint', { count: expensesQuery.data.meta.total })
              }
            />
            <StatCard
              icon={HandCoins}
              label={t('finance.debt')}
              amount={totals?.debt}
              tone={totals && Number(totals.debt) > 0 ? 'negative' : 'default'}
              hint={totals && t('finance.debtHint', { amount: formatAmount(totals.accrued) })}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>{t('finance.chart.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                {summary ? (
                  <FinanceChart series={summary.series} period={period} today={today} />
                ) : (
                  <Skeleton className="h-72 rounded-xl" />
                )}
              </CardContent>
            </Card>

            <div className="grid content-start gap-5">
              <Card className="border-dashed">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2.5 text-lg">
                    <CalendarClock className="size-5 text-muted-foreground" />
                    {t('finance.upcoming.title')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {summary ? (
                    <>
                      <dl className="grid gap-2.5 text-sm">
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">{t('finance.upcoming.count')}</dt>
                          <dd className="tabular font-semibold">{summary.upcoming.count}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">{t('finance.upcoming.total')}</dt>
                          <dd className="tabular font-semibold whitespace-nowrap">
                            {formatAmount(summary.upcoming.total)} {currency}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">{t('finance.upcoming.paid')}</dt>
                          <dd className="tabular font-semibold whitespace-nowrap">
                            {formatAmount(summary.upcoming.paid)} {currency}
                          </dd>
                        </div>
                      </dl>
                      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                        {t('finance.upcoming.note')}
                      </p>
                    </>
                  ) : (
                    <Skeleton className="h-24 rounded-xl" />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t('finance.byCategory')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {!summary ? (
                    <Skeleton className="h-24 rounded-xl" />
                  ) : summary.expensesByCategory.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('finance.noExpenses')}</p>
                  ) : (
                    <ul className="grid gap-3.5">
                      {summary.expensesByCategory.map((category) => (
                        <li key={category.id}>
                          <div className="flex justify-between gap-3 text-sm">
                            <span className="min-w-0 truncate font-medium">{category.name}</span>
                            <span className="tabular font-semibold whitespace-nowrap">
                              {formatAmount(category.amount)}
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className="bg-gold-gradient h-full rounded-full"
                              style={{
                                width: `${Math.max(2, (Number(category.amount) / topCategory) * 100)}%`,
                              }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle>{t('finance.expensesTitle')}</CardTitle>
            </CardHeader>
            {expensesQuery.isError ? (
              <ErrorState
                error={expensesQuery.error}
                onRetry={() => void expensesQuery.refetch()}
              />
            ) : (
              <>
                <DataTable
                  columns={expenseColumns}
                  rows={expensesQuery.data?.items}
                  rowKey={(expense) => expense.id}
                  loading={expensesQuery.isLoading}
                  skeletonRows={3}
                  empty={
                    <EmptyState
                      title={t('finance.empty.expensesTitle')}
                      description={t('finance.empty.expensesText')}
                      action={addExpenseButton}
                    />
                  }
                />
                {(expensesQuery.data?.meta.totalPages ?? 1) > 1 && (
                  <Pagination meta={expensesQuery.data?.meta} onPageChange={setPage} />
                )}
              </>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>{t('finance.events.title')}</CardTitle>
            </CardHeader>
            <DataTable
              columns={eventColumns}
              rows={summary?.events}
              rowKey={(event) => event.id}
              loading={summaryQuery.isLoading}
              skeletonRows={3}
              onRowClick={
                can('events:read') ? (event) => navigate(`${ROUTES.events}/${event.id}`) : undefined
              }
              empty={
                <EmptyState
                  title={t('finance.empty.eventsTitle')}
                  description={t('finance.empty.eventsText')}
                />
              }
            />
            {summary && totals && totals.eventsCount > summary.events.length && (
              <p className="border-t px-5 py-3 text-xs text-muted-foreground">
                {t('finance.events.truncated', {
                  shown: summary.events.length,
                  count: totals.eventsCount,
                })}
              </p>
            )}
          </Card>
        </div>
      )}

      <ExpenseFormDialog
        open={dialog?.type === 'expense'}
        onOpenChange={(open) => !open && setDialog(null)}
        categories={categories}
        expense={dialog?.type === 'expense' ? dialog.expense : undefined}
      />
      <CategoryManagerDialog
        open={dialog?.type === 'categories'}
        onOpenChange={(open) => !open && setDialog(null)}
        categories={categories}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t('finance.confirm.deleteTitle')}
        description={t('finance.confirm.deleteText', {
          category: deleting?.category.name ?? '',
          amount: formatAmount(deleting?.amount),
        })}
        confirmLabel={t('common.delete')}
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
      />
    </>
  );
}
