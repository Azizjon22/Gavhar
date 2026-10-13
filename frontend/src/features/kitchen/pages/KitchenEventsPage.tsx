import { CalendarDays, CalendarHeart, ChevronLeft, ChevronRight, List } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorState } from '@/components/shared/ErrorState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { KitchenEvent } from '@/features/shopping/types/shopping.types';
import { inAppZone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { KitchenEventCard } from '../components/KitchenEventCard';
import { daysUntil } from '../lib/kitchen';
import { useKitchenAgenda } from '../lib/use-kitchen';

const BUCKETS = [
  { key: 'week', test: (days: number) => days < 7 },
  { key: 'month', test: (days: number) => days >= 7 && days < 30 },
  { key: 'later', test: (days: number) => days >= 30 },
] as const;

/** Oshpaz uchun to'ylar: haftalar bo'yicha ro'yxat yoki oy kalendari. */
export function KitchenEventsPage() {
  const { t } = useTranslation();
  const { query, events } = useKitchenAgenda();
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [onlyMissing, setOnlyMissing] = useState(false);

  const missing = (events ?? []).filter((event) => event.lists.length === 0).length;
  const shown = (events ?? []).filter((event) => !onlyMissing || event.lists.length === 0);

  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {t('kitchen.events.title')}
          </h1>
          {events && (
            <p className="mt-1 text-sm text-muted-foreground">
              {t('kitchen.events.count', { count: events.length })}
              {missing > 0 && ` · ${t('kitchen.home.withoutList', { count: missing })}`}
            </p>
          )}
        </div>
        <div
          role="radiogroup"
          aria-label={t('kitchen.events.view')}
          className="inline-flex rounded-xl bg-muted p-1"
        >
          {(
            [
              ['list', List],
              ['calendar', CalendarDays],
            ] as const
          ).map(([key, Icon]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={view === key}
              onClick={() => setView(key)}
              className={cn(
                'flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                view === key ? 'bg-card shadow-soft' : 'text-muted-foreground',
              )}
            >
              <Icon className="size-4" />
              {t(`kitchen.events.${key}`)}
            </button>
          ))}
        </div>
      </div>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : !events ? (
        <div className="grid grid-cols-1 gap-3">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      ) : view === 'calendar' ? (
        <KitchenCalendar events={events} />
      ) : (
        <>
          {missing > 0 && (
            <button
              type="button"
              aria-pressed={onlyMissing}
              onClick={() => setOnlyMissing((value) => !value)}
              className={cn(
                'w-fit cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                onlyMissing
                  ? 'border-gold bg-gold text-[#1b1407]'
                  : 'bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              {t('kitchen.events.onlyMissing', { count: missing })}
            </button>
          )}
          {shown.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-card/60 py-12 text-center">
              <CalendarHeart className="size-7 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">{t('kitchen.events.empty')}</p>
            </div>
          )}
          {BUCKETS.map((bucket) => {
            const items = shown.filter((event) => bucket.test(daysUntil(event.day)));
            if (items.length === 0) return null;
            return (
              <section key={bucket.key} className="grid grid-cols-1 gap-3">
                <h2 className="text-xs font-bold tracking-[0.2em] text-muted-foreground uppercase">
                  {t(`kitchen.events.buckets.${bucket.key}`)} · {items.length}
                </h2>
                {items.map((event) => (
                  <KitchenEventCard key={event.id} event={event} />
                ))}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

/** Oy kalendari: kunni bossangiz, o'sha kungi to'ylar pastda ochiladi. */
function KitchenCalendar({ events }: { events: KitchenEvent[] }) {
  const { t } = useTranslation();
  const [cursor, setCursor] = useState(() => inAppZone().startOf('month'));
  const [selected, setSelected] = useState<string | null>(null);
  const today = inAppZone().format('YYYY-MM-DD');

  const byDay = useMemo(() => {
    const map = new Map<string, KitchenEvent[]>();
    for (const event of events) map.set(event.day, [...(map.get(event.day) ?? []), event]);
    return map;
  }, [events]);
  const start = cursor.startOf('isoWeek');
  const days = Array.from({ length: 42 }, (_, index) => start.add(index, 'day'));
  const picked = selected ? (byDay.get(selected) ?? []) : [];

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="rounded-2xl border bg-card p-3 shadow-soft sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('kitchen.events.prevMonth')}
            onClick={() => setCursor((value) => value.subtract(1, 'month'))}
          >
            <ChevronLeft />
          </Button>
          <p className="font-display text-lg font-semibold capitalize">
            {cursor.format('MMMM YYYY')}
          </p>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('kitchen.events.nextMonth')}
            onClick={() => setCursor((value) => value.add(1, 'month'))}
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {days.slice(0, 7).map((day) => (
            <span
              key={day.format('d')}
              className="pb-1 text-[11px] font-bold text-muted-foreground uppercase"
            >
              {day.format('dd')}
            </span>
          ))}
          {days.map((day) => {
            const key = day.format('YYYY-MM-DD');
            const count = byDay.get(key)?.length ?? 0;
            const inMonth = day.month() === cursor.month();
            return (
              <button
                key={key}
                type="button"
                disabled={count === 0}
                aria-pressed={selected === key}
                aria-label={`${day.format('D MMMM')}${count ? `: ${t('kitchen.events.count', { count })}` : ''}`}
                onClick={() => setSelected(selected === key ? null : key)}
                className={cn(
                  'tabular relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm transition',
                  !inMonth && 'opacity-35',
                  key === today && 'ring-1 ring-gold',
                  count > 0
                    ? 'cursor-pointer bg-primary/10 font-bold text-primary hover:bg-primary/15 dark:text-gold-light'
                    : 'text-muted-foreground',
                  selected === key &&
                    'bg-primary text-primary-foreground hover:bg-primary dark:text-primary-foreground',
                )}
              >
                {day.format('D')}
                {count > 0 && (
                  <span className="absolute bottom-1.5 flex gap-0.5">
                    {Array.from({ length: Math.min(count, 3) }, (_, index) => (
                      <span
                        key={index}
                        className={cn(
                          'size-1 rounded-full',
                          selected === key ? 'bg-primary-foreground' : 'bg-gold',
                        )}
                      />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      {picked.map((event) => (
        <KitchenEventCard key={event.id} event={event} defaultOpen />
      ))}
    </div>
  );
}
