import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Dayjs } from 'dayjs';
import { ChevronLeft, ChevronRight, Clock, Plus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ErrorState } from '@/components/shared/ErrorState';
import { Button } from '@/components/ui/button';
import { formatTime, inAppZone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { eventKeys, eventsApi } from '../api/events.api';
import type { EventSummary } from '../types/event.types';
import { STATUS_CHIP } from '../lib/status';

type View = 'month' | 'week' | 'day';
const VIEWS: View[] = ['month', 'week', 'day'];
const DAY_KEY = 'YYYY-MM-DD';
const MAX_CHIPS = 3;

/** Ko'rinishga qarab ko'rsatiladigan kunlar (hafta dushanbadan boshlanadi). */
function visibleDays(view: View, cursor: Dayjs): Dayjs[] {
  if (view === 'day') return [cursor.startOf('day')];
  const start =
    view === 'week' ? cursor.startOf('isoWeek') : cursor.startOf('month').startOf('isoWeek');
  return Array.from({ length: view === 'week' ? 7 : 42 }, (_, index) => start.add(index, 'day'));
}

interface EventCalendarProps {
  /** Berilsa, kun yonida "bron qo'shish" tugmasi chiqadi. */
  onCreate?: (date: string) => void;
}

/** Bronlar kalendari: oy, hafta va kun ko'rinishlari (Toshkent vaqti bo'yicha). */
export function EventCalendar({ onCreate }: EventCalendarProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState(() => inAppZone().startOf('day'));

  const days = useMemo(() => visibleDays(view, cursor), [view, cursor]);
  const from = (days[0] ?? cursor).toISOString();
  const to = (days.at(-1) ?? cursor).add(1, 'day').toISOString();

  const query = useQuery({
    queryKey: eventKeys.calendar(from, to),
    queryFn: () => eventsApi.calendar(from, to),
    placeholderData: keepPreviousData,
  });

  const byDay = useMemo(() => {
    const map = new Map<string, EventSummary[]>();
    for (const event of query.data ?? []) {
      const key = inAppZone(event.startAt).format(DAY_KEY);
      map.set(key, [...(map.get(key) ?? []), event]);
    }
    return map;
  }, [query.data]);

  const today = inAppZone().format(DAY_KEY);
  const step = (direction: 1 | -1) => setCursor((current) => current.add(direction, view));
  const openDay = (day: Dayjs) => {
    setCursor(day);
    setView('day');
  };

  const title =
    view === 'month'
      ? cursor.format('MMMM YYYY')
      : view === 'day'
        ? cursor.format('D MMMM YYYY, dddd')
        : `${(days[0] ?? cursor).format('D MMM')} – ${(days[6] ?? cursor).format('D MMM YYYY')}`;

  return (
    <div>
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t('events.calendar.prev')}
            onClick={() => step(-1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t('events.calendar.next')}
            onClick={() => step(1)}
          >
            <ChevronRight />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCursor(inAppZone().startOf('day'))}>
            {t('events.calendar.today')}
          </Button>
        </div>
        <h2 className="font-display text-xl font-semibold tracking-tight first-letter:uppercase sm:flex-1">
          {title}
        </h2>
        <div role="tablist" className="flex self-start rounded-lg bg-muted p-0.5 sm:self-auto">
          {VIEWS.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={view === option}
              onClick={() => setView(option)}
              className={cn(
                'cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                view === option ? 'bg-card shadow-soft' : 'text-muted-foreground',
              )}
            >
              {t(`events.calendar.${option}`)}
            </button>
          ))}
        </div>
      </div>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : view === 'month' ? (
        <div className={cn('transition-opacity', query.isFetching && 'opacity-70')}>
          <div className="grid grid-cols-7 border-b text-center text-xs font-semibold text-muted-foreground uppercase">
            {days.slice(0, 7).map((day) => (
              <div key={day.format(DAY_KEY)} className="py-2">
                {day.format('dd')}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = day.format(DAY_KEY);
              const events = byDay.get(key) ?? [];
              const inMonth = day.month() === cursor.month();
              return (
                <div
                  key={key}
                  className={cn(
                    'group min-h-20 border-r border-b p-1 [&:nth-child(7n)]:border-r-0 sm:min-h-28 sm:p-1.5',
                    !inMonth && 'bg-muted/40',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => openDay(day)}
                      aria-label={day.format('D MMMM')}
                      className={cn(
                        'tabular flex size-7 cursor-pointer items-center justify-center rounded-full text-sm font-medium outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50',
                        key === today &&
                          'bg-primary font-bold text-primary-foreground hover:bg-primary/90',
                        !inMonth && 'text-muted-foreground',
                      )}
                    >
                      {day.date()}
                    </button>
                    {onCreate && (
                      <button
                        type="button"
                        onClick={() => onCreate(key)}
                        aria-label={t('events.calendar.addOn', { date: day.format('D MMMM') })}
                        className="hidden size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 sm:flex"
                      >
                        <Plus className="size-4" />
                      </button>
                    )}
                  </div>

                  {/* Telefonda joy tor — faqat bronlar soni; kunni bosib ro'yxatini ko'rish mumkin. */}
                  {events.length > 0 && (
                    <button
                      type="button"
                      onClick={() => openDay(day)}
                      className="tabular mx-auto mt-1 flex size-6 items-center justify-center rounded-full bg-gold/20 text-xs font-bold text-gold-dark sm:hidden dark:text-gold-light"
                    >
                      {events.length}
                    </button>
                  )}
                  <ul className="mt-1 hidden gap-1 sm:grid">
                    {events.slice(0, MAX_CHIPS).map((event) => (
                      <li key={event.id}>
                        <Link
                          to={`/events/${event.id}`}
                          title={event.client.fullName}
                          className={cn(
                            'tabular block truncate rounded-md px-1.5 py-0.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                            STATUS_CHIP[event.status],
                          )}
                        >
                          {formatTime(event.startAt)} {event.client.fullName}
                        </Link>
                      </li>
                    ))}
                    {events.length > MAX_CHIPS && (
                      <li>
                        <button
                          type="button"
                          onClick={() => openDay(day)}
                          className="cursor-pointer rounded px-1.5 text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
                          {t('events.calendar.more', { count: events.length - MAX_CHIPS })}
                        </button>
                      </li>
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          className={cn(
            'grid gap-px bg-border transition-opacity',
            view === 'week' && 'lg:grid-cols-7',
            query.isFetching && 'opacity-70',
          )}
        >
          {days.map((day) => {
            const key = day.format(DAY_KEY);
            const events = byDay.get(key) ?? [];
            return (
              <section key={key} className="min-w-0 bg-card p-3 lg:min-h-80">
                {view === 'week' && (
                  <button
                    type="button"
                    onClick={() => openDay(day)}
                    className={cn(
                      'mb-3 flex w-full cursor-pointer items-baseline gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                      key === today && 'text-gold-dark dark:text-gold-light',
                    )}
                  >
                    <span className="tabular font-display text-2xl font-semibold">
                      {day.date()}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase">
                      {day.format('dd')}
                    </span>
                  </button>
                )}
                <ul className={cn('grid gap-2', view === 'day' && 'sm:grid-cols-2 xl:grid-cols-3')}>
                  {events.map((event) => (
                    <li key={event.id}>
                      <Link
                        to={`/events/${event.id}`}
                        className={cn(
                          'block rounded-xl p-3 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                          STATUS_CHIP[event.status],
                        )}
                      >
                        <span className="tabular flex items-center gap-1.5 text-xs font-bold">
                          <Clock className="size-3.5" />
                          {formatTime(event.startAt)}–{formatTime(event.endAt)}
                        </span>
                        <span className="mt-1 block truncate font-semibold text-foreground">
                          {event.client.fullName}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                          <Users className="size-3" /> {event.guestCount}
                        </span>
                        {view === 'day' && (
                          <span className="mt-1.5 block text-xs font-medium">
                            {t(`events.type.${event.type}`)} · {t(`events.status.${event.status}`)}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
                {events.length === 0 && (
                  <p
                    className={cn(
                      'text-sm text-muted-foreground',
                      view === 'day' && 'py-10 text-center',
                    )}
                  >
                    {view === 'day' ? t('events.calendar.freeDay') : '—'}
                  </p>
                )}
                {view === 'day' && onCreate && (
                  <div className="mt-4 flex justify-center">
                    <Button variant="outline" onClick={() => onCreate(key)}>
                      <Plus />
                      {t('events.calendar.addOn', { date: day.format('D MMMM') })}
                    </Button>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
