import { ArrowRight, CalendarHeart, ChefHat, ClipboardList, Plus, Warehouse } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ROUTES } from '@/app/router/paths';
import { ErrorState } from '@/components/shared/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/hooks/use-permissions';
import { inAppZone } from '@/lib/format';
import { useAuthStore } from '@/stores/auth.store';
import { KitchenEventCard } from '../components/KitchenEventCard';
import { KitchenListCard } from '../components/KitchenListCard';
import { daysUntil } from '../lib/kitchen';
import { useKitchenAgenda, useMyLists } from '../lib/use-kitchen';

const greetingKey = (hour: number) =>
  hour < 12 ? 'kitchen.home.morning' : hour < 18 ? 'kitchen.home.day' : 'kitchen.home.evening';

/** Oshpazning bosh sahifasi: salom, keyingi to'y, tezkor amallar va ro'yxatlar holati. */
export function KitchenHomePage() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const user = useAuthStore((state) => state.user);
  const { query, events } = useKitchenAgenda();
  const myLists = useMyLists();
  const now = inAppZone();

  const week = (events ?? []).filter((event) => daysUntil(event.day) < 7);
  const withoutList = week.filter((event) => event.lists.length === 0);
  const next = events?.[0];
  const active = (myLists.data ?? []).filter((list) => list.status !== 'CONFIRMED').slice(0, 3);
  const firstName = user?.fullName.split(' ')[0] ?? '';

  return (
    <div className="grid grid-cols-1 gap-7">
      <section className="relative">
        <p className="text-xs font-bold tracking-[0.2em] text-gold-dark uppercase dark:text-gold-light">
          {now.format('dddd · D MMMM')}
        </p>
        <h1 className="mt-1.5 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {t(greetingKey(now.hour()), { name: firstName })}
        </h1>
        <span aria-hidden className="mt-2.5 block h-0.5 w-14 rounded-full bg-gold-gradient" />
        {events && (
          <p className="mt-2.5 text-sm text-muted-foreground">
            {week.length > 0
              ? t('kitchen.home.week', { count: week.length })
              : t('kitchen.home.weekEmpty')}
            {withoutList.length > 0 &&
              ` · ${t('kitchen.home.withoutList', { count: withoutList.length })}`}
          </p>
        )}
      </section>

      <section className="grid grid-cols-1 gap-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <CalendarHeart className="size-4 text-primary dark:text-gold-light" />
            {t('kitchen.home.next')}
          </h2>
          {events && events.length > 0 && (
            <Link
              to={ROUTES.kitchenEvents}
              className="text-sm font-semibold text-primary hover:underline dark:text-gold-light"
            >
              {t('kitchen.home.all', { count: events.length })} →
            </Link>
          )}
        </div>
        {query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : !events ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : next ? (
          <KitchenEventCard event={next} defaultOpen hero />
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-card/60 py-10 text-center">
            <CalendarHeart className="size-7 text-muted-foreground/50" />
            <p className="max-w-xs text-sm text-muted-foreground">{t('kitchen.home.noEvents')}</p>
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Link
          to={ROUTES.kitchenShopping}
          className="group flex items-center gap-3 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/12 via-card to-card p-4 shadow-soft transition hover:-translate-y-0.5"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Plus className="size-5" />
          </span>
          <span className="text-sm leading-tight font-semibold">{t('kitchen.home.newList')}</span>
        </Link>
        <Link
          to={`${ROUTES.kitchenShopping}?tab=mine`}
          className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-soft transition hover:-translate-y-0.5"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold-dark dark:text-gold-light">
            <ClipboardList className="size-5" />
          </span>
          <span className="text-sm leading-tight font-semibold">
            {t('kitchen.home.myLists')}{' '}
            {myLists.data && (
              <span className="tabular text-muted-foreground">({myLists.data.length})</span>
            )}
          </span>
        </Link>
        {can('warehouse:take') && (
          <Link
            to={ROUTES.kitchenStock}
            className="col-span-2 flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-soft transition hover:-translate-y-0.5 sm:col-span-1"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success/12 text-success">
              <Warehouse className="size-5" />
            </span>
            <span className="min-w-0 flex-1 text-sm leading-tight font-semibold">
              {t('kitchen.home.takeStock')}
            </span>
            <ArrowRight className="size-4 text-muted-foreground" />
          </Link>
        )}
      </section>

      {active.length > 0 && (
        <section className="grid grid-cols-1 gap-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <ChefHat className="size-4 text-gold-dark dark:text-gold-light" />
            {t('kitchen.home.listsStatus')}
          </h2>
          {active.map((list) => (
            <KitchenListCard key={list.id} list={list} compact />
          ))}
        </section>
      )}
    </div>
  );
}
