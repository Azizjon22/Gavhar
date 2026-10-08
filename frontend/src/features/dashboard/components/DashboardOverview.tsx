import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  Armchair,
  CalendarDays,
  Clock,
  MapPin,
  ShoppingBasket,
  Soup,
  TriangleAlert,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ROUTES } from '@/app/router/paths';
import { ErrorState } from '@/components/shared/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EventStatusBadge } from '@/features/events/components/EventStatusBadge';
import { formatQuantity } from '@/features/warehouse/lib/quantity';
import { WorkerAvatar } from '@/features/workers/components/WorkerAvatar';
import { usePermissions } from '@/hooks/use-permissions';
import { formatTime } from '@/lib/format';
import { formatAmount } from '@/lib/money';
import { cn } from '@/lib/utils';
import { dashboardApi, dashboardKeys } from '../api/dashboard.api';
import type { DashboardEventCard, DashboardOverview as Overview } from '../types/dashboard.types';

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="tabular mt-1.5 font-display text-4xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

function EventCard({ event, highlight }: { event: DashboardEventCard; highlight: boolean }) {
  const { t } = useTranslation();
  const canOpen = usePermissions().can('events:read');
  const title = event.title ?? t(`events.type.${event.type}`);
  const dishes = [event.firstDish, event.secondDish].filter(Boolean).join(' · ');

  return (
    <article
      className={cn(
        'rounded-2xl border bg-card p-4 shadow-soft sm:p-5',
        highlight && 'border-gold/60',
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <h3 className="min-w-0 font-display text-xl leading-tight font-semibold">
          {canOpen ? (
            <Link
              to={`${ROUTES.events}/${event.id}`}
              className="rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {title}
            </Link>
          ) : (
            title
          )}
        </h3>
        <EventStatusBadge status={event.status} />
      </header>
      <p className="tabular mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Clock className="size-3.5" />
          {formatTime(event.startAt)}–{formatTime(event.endAt)}
        </span>
        <span className="flex items-center gap-1.5">
          <MapPin className="size-3.5" />
          {event.hallName}
        </span>
        <span className="flex items-center gap-1.5 font-semibold text-foreground">
          <Users className="size-3.5" />
          {t('halls.guests', { count: event.guestCount })}
        </span>
        {event.tableCapacity && (
          <span className="flex items-center gap-1.5">
            <Armchair className="size-3.5" />
            {t('events.tableSeats', { count: event.tableCapacity })}
          </span>
        )}
      </p>
      {(event.menuName || dishes) && (
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {event.menuName && (
            <span className="flex items-center gap-1.5">
              <UtensilsCrossed className="size-3.5 text-gold-dark dark:text-gold-light" />
              {event.menuName}
            </span>
          )}
          {dishes && (
            <span className="flex items-center gap-1.5">
              <Soup className="size-3.5 text-gold-dark dark:text-gold-light" />
              {dishes}
            </span>
          )}
        </p>
      )}

      <footer className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {event.workers.length > 0 ? (
            <>
              <span className="flex -space-x-2">
                {event.workers.slice(0, 5).map((worker) => (
                  <WorkerAvatar
                    key={worker.id}
                    worker={worker}
                    className="size-8 ring-2 ring-card"
                  />
                ))}
              </span>
              <span className="text-xs text-muted-foreground">
                {t('dashboard.workers', { count: event.workers.length })}
              </span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">{t('dashboard.noWorkers')}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {event.shoppingListCount > 0 && (
            <Badge variant="secondary" className="gap-1">
              <ShoppingBasket className="size-3" />
              {event.shoppingListCount}
            </Badge>
          )}
          {event.debt !== undefined && Number(event.debt) > 0 && (
            <span className="tabular text-xs font-semibold text-destructive">
              {t('events.debt', { amount: formatAmount(event.debt) })}
            </span>
          )}
        </div>
      </footer>
    </article>
  );
}

function EventsBlock({
  title,
  events,
  empty,
  highlight,
}: {
  title: string;
  events: DashboardEventCard[];
  empty: string;
  highlight: boolean;
}) {
  return (
    <section className="grid content-start gap-3">
      <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
      {events.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        events.map((event) => <EventCard key={event.id} event={event} highlight={highlight} />)
      )}
    </section>
  );
}

function Financials({ data }: { data: NonNullable<Overview['monthlyFinancials']> }) {
  const { t } = useTranslation();
  const profit = Number(data.netProfit);
  const rows = [
    ['dashboard.month.expected', data.totalExpected],
    ['dashboard.month.collected', data.totalCollected],
    ['dashboard.month.outstanding', data.totalOutstanding],
    ['dashboard.month.expenses', data.totalExpenses],
  ] as const;
  return (
    <Card className="bg-sidebar-gradient border-sidebar-border text-white">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-baseline justify-between gap-2 text-white">
          {t('dashboard.month.title')}
          <span className="text-sm font-normal text-white/60">
            {t('dashboard.month.events', { count: data.eventCount })}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-5">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-white/60">{t(label)}</dt>
              <dd className="tabular mt-1 text-lg font-semibold whitespace-nowrap">
                {formatAmount(value)}
              </dd>
            </div>
          ))}
          <div className="col-span-2 lg:col-span-1">
            <dt className="text-xs text-white/60">{t('finance.profit')}</dt>
            <dd
              className={cn(
                'tabular mt-0.5 font-display text-2xl font-semibold whitespace-nowrap',
                profit < 0 ? 'text-red-300' : 'text-gold-gradient',
              )}
            >
              {formatAmount(data.netProfit)}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

/** Bosh sahifadagi ish stoli: bugun va ertaga nima bor, hafta va diqqat talab qiladigan narsalar. */
export function DashboardOverview() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const query = useQuery({
    queryKey: dashboardKeys.overview,
    queryFn: dashboardApi.overview,
    refetchInterval: 60_000,
  });

  if (query.isError) {
    return (
      <Card>
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </Card>
    );
  }
  const data = query.data;
  if (!data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <Skeleton key={item} className="h-28 rounded-2xl" />
        ))}
      </div>
    );
  }

  const pending = data.pendingShopping;
  const tasks = pending
    ? (
        [
          ['review', pending.toReview],
          ['confirm', pending.toConfirm],
          ['purchase', pending.toPurchase],
        ] as const
      ).filter(([, count]) => count > 0)
    : [];

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t('dashboard.stats.today')} value={data.counts.today} />
        <Stat label={t('dashboard.stats.tomorrow')} value={data.counts.tomorrow} />
        <Stat
          label={t('dashboard.stats.week')}
          value={data.counts.week}
          hint={t('dashboard.stats.weekGuests', { count: data.counts.weekGuests })}
        />
        <Stat
          label={t('dashboard.stats.active')}
          value={data.counts.active}
          hint={t('dashboard.stats.thisMonth', { count: data.counts.thisMonth })}
        />
      </div>

      {data.monthlyFinancials && <Financials data={data.monthlyFinancials} />}

      {tasks.length > 0 && can('shopping:read') && (
        <Link
          to={ROUTES.shopping}
          className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-gold/40 bg-gold/10 px-5 py-3.5 text-sm font-semibold outline-none hover:bg-gold/15 focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <ShoppingBasket className="size-4 text-gold-dark dark:text-gold-light" />
          {tasks.map(([key, count]) => (
            <span key={key}>{t(`shopping.tasks.${key}`, { count })}</span>
          ))}
        </Link>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <EventsBlock
          title={t('dashboard.today')}
          events={data.todayEvents}
          empty={t('dashboard.noToday')}
          highlight
        />
        <EventsBlock
          title={t('dashboard.tomorrow')}
          events={data.tomorrowEvents}
          empty={t('dashboard.noTomorrow')}
          highlight={false}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5">
              <CalendarDays className="size-5 text-muted-foreground" />
              {t('dashboard.week')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-2 sm:grid-cols-7">
              {data.week.map((day) => {
                const date = dayjs(day.date, 'YYYY-MM-DD');
                const isToday = day.date === data.today;
                return (
                  <li
                    key={day.date}
                    className={cn(
                      'flex gap-3 rounded-xl border p-2.5 sm:min-h-28 sm:flex-col sm:gap-1.5',
                      isToday && 'border-gold/60 bg-gold/8',
                    )}
                  >
                    <p className="w-14 shrink-0 text-xs font-semibold text-muted-foreground sm:w-auto">
                      <span className="capitalize">{date.format('dd')}</span>{' '}
                      <span className="tabular text-foreground">{date.format('D')}</span>
                    </p>
                    <ul className="grid min-w-0 flex-1 content-start gap-1">
                      {day.events.map((event) => (
                        <li key={event.id} className="min-w-0 rounded-md bg-primary/10 px-1.5 py-1">
                          <p className="truncate text-xs font-semibold">{event.title}</p>
                          <p className="tabular text-[11px] text-muted-foreground">
                            {formatTime(event.startAt)} · {event.guestCount}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>

        {data.lowStock && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2.5 text-lg">
                <TriangleAlert
                  className={cn(
                    'size-5',
                    data.lowStock.length > 0 ? 'text-destructive' : 'text-muted-foreground',
                  )}
                />
                {t('dashboard.lowStock')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.lowStock.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('dashboard.noLowStock')}</p>
              ) : (
                <ul className="grid gap-2.5 text-sm">
                  {data.lowStock.slice(0, 8).map((item) => (
                    <li key={item.id} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate font-medium">{item.name}</span>
                      <span className="tabular whitespace-nowrap">
                        <span className="font-semibold text-destructive">
                          {formatQuantity(item.quantity)}
                        </span>
                        <span className="text-muted-foreground">
                          {' '}
                          / {formatQuantity(item.minQuantity)} {t(`warehouse.unit.${item.unit}`)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {can('warehouse:read') && data.lowStock.length > 0 && (
                <Link
                  to={ROUTES.warehouse}
                  className="mt-3 inline-block rounded-sm text-sm font-semibold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  {t('dashboard.openWarehouse')}
                </Link>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
