import {
  CalendarDays,
  ChevronDown,
  Clock,
  MapPin,
  Plus,
  Soup,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { localizedName } from '@/features/menu/types/menu.types';
import { formatTime, inAppZone } from '@/lib/format';
import { formatAmount } from '@/lib/money';
import { cn } from '@/lib/utils';
import { useLocaleStore } from '@/stores/locale.store';
import type { KitchenEvent, ShoppingList } from '../types/shopping.types';
import { type ListAction, ShoppingListBlock } from './ShoppingListBlock';

interface Props {
  event: KitchenEvent;
  viewer: { id: string; isSuperAdmin: boolean; canWrite: boolean; canPurchase: boolean };
  today: string;
  onWrite: (event: KitchenEvent) => void;
  onAction: (action: ListAction, event: KitchenEvent, list: ShoppingList) => void;
}

/** Bitta to'y kartasi: qachon, qayerda, necha kishi, menyusi va bozorlik ro'yxatlari. */
export function EventCard({ event, viewer, today, onWrite, onAction }: Props) {
  const { t } = useTranslation();
  const language = useLocaleStore((state) => state.language);
  const isToday = event.day === today;
  const cancelled = event.status === 'CANCELLED';
  const [menuOpen, setMenuOpen] = useState(isToday);
  const date = inAppZone(event.startAt);
  const hasPrices = Number(event.total) > 0;

  return (
    <Card className={cn('overflow-hidden', isToday && 'border-gold/60 shadow-lifted')}>
      <header
        className={cn(
          'flex flex-wrap items-center gap-x-4 gap-y-3 p-4 sm:p-5',
          isToday && 'bg-sidebar-gradient text-white',
        )}
      >
        <div
          className={cn(
            'flex size-14 shrink-0 flex-col items-center justify-center rounded-xl leading-none',
            isToday ? 'bg-white/10' : 'bg-muted',
          )}
        >
          <span className="tabular font-display text-2xl font-semibold">{date.format('D')}</span>
          <span
            className={cn(
              'mt-0.5 text-[10px] font-bold tracking-wider uppercase',
              isToday ? 'text-gold-light' : 'text-muted-foreground',
            )}
          >
            {date.format('MMM')}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 font-display text-xl leading-tight font-semibold">
            <span className="min-w-0">{event.title ?? t(`events.type.${event.type}`)}</span>
            {isToday && <Badge variant="gold">{t('shopping.today')}</Badge>}
            {cancelled && <Badge variant="destructive">{t('events.status.CANCELLED')}</Badge>}
          </h2>
          <p
            className={cn(
              'tabular mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm',
              isToday ? 'text-white/75' : 'text-muted-foreground',
            )}
          >
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-3.5" />
              {date.format('D MMMM, dddd')}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5" />
              {formatTime(event.startAt)}–{formatTime(event.endAt)}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5" />
              {event.hallName}
            </span>
            <span className="flex items-center gap-1.5 font-semibold">
              <Users className="size-3.5" />
              {t('halls.guests', { count: event.guestCount })}
              {event.tableCapacity &&
                ` · ${t('events.tableSeats', { count: event.tableCapacity })}`}
            </span>
          </p>
        </div>
        {viewer.canWrite && !cancelled && !event.shoppingClosed && (
          <Button
            variant={isToday ? 'gold' : 'outline'}
            className={cn('max-sm:w-full', !isToday && 'bg-card')}
            onClick={() => onWrite(event)}
          >
            <Plus />
            {t('shopping.write')}
          </Button>
        )}
      </header>

      <div className="grid gap-4 border-t p-4 sm:p-5">
        {(event.firstDish || event.secondDish) && (
          <dl className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ['shopping.firstDish', event.firstDish],
                ['shopping.secondDish', event.secondDish],
              ] as const
            ).map(
              ([label, dish]) =>
                dish && (
                  <div
                    key={label}
                    className="rounded-xl border border-gold/30 bg-gold/8 px-4 py-2.5"
                  >
                    <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Soup className="size-3.5" />
                      {t(label)}
                    </dt>
                    <dd className="mt-0.5 font-semibold">{dish}</dd>
                  </div>
                ),
            )}
          </dl>
        )}
        {event.menu ? (
          <section>
            <button
              type="button"
              aria-expanded={menuOpen}
              disabled={event.menu.sections.length === 0}
              onClick={() => setMenuOpen((open) => !open)}
              className="flex w-full cursor-pointer items-center gap-2 rounded-lg text-left text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-default"
            >
              <UtensilsCrossed className="size-4 text-gold-dark dark:text-gold-light" />
              {t('shopping.menu')}: {event.menu.name}
              {event.menu.sections.length > 0 && (
                <ChevronDown
                  className={cn(
                    'ml-auto size-4 text-muted-foreground transition-transform',
                    menuOpen && 'rotate-180',
                  )}
                />
              )}
            </button>
            {menuOpen && event.menu.sections.length > 0 && (
              <ul className="mt-2.5 grid gap-x-8 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2 xl:grid-cols-3">
                {event.menu.sections.map((section) => (
                  <li key={section.nameUz}>
                    <span className="font-medium text-foreground">
                      {localizedName(section, language)}
                    </span>
                    {section.kindsCount > 1 &&
                      ` · ${t('menu.kinds', { count: section.kindsCount })}`}
                    {section.items.length > 0 && ` — ${section.items.join(', ')}`}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <UtensilsCrossed className="size-4" />
            {t('shopping.noMenu')}
          </p>
        )}

        <section className="grid gap-3">
          <h3 className="text-sm font-semibold">{t('shopping.lists')}</h3>
          {event.lists.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
              {t('shopping.noLists')}
            </p>
          ) : (
            event.lists.map((list) => (
              <ShoppingListBlock
                key={list.id}
                event={event}
                list={list}
                viewer={viewer}
                today={today}
                onAction={(action, target) => onAction(action, event, target)}
              />
            ))
          )}
          {hasPrices && (
            <p className="flex items-baseline justify-between gap-3 rounded-xl bg-muted/60 px-4 py-3">
              <span className="text-sm font-medium">{t('shopping.total')}</span>
              <span className="tabular font-display text-xl font-semibold whitespace-nowrap">
                {formatAmount(event.total)}{' '}
                <span className="font-sans text-xs font-medium text-muted-foreground">
                  {t('common.currency')}
                </span>
              </span>
            </p>
          )}
        </section>
      </div>
    </Card>
  );
}
