import {
  AlertTriangle,
  Check,
  ChevronDown,
  ClipboardList,
  Plus,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ROUTES } from '@/app/router/paths';
import { Button } from '@/components/ui/button';
import { localizedName } from '@/features/menu/types/menu.types';
import type { KitchenEvent } from '@/features/shopping/types/shopping.types';
import { formatTime, inAppZone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useLocaleStore } from '@/stores/locale.store';
import { daysUntil } from '../lib/kitchen';

interface Props {
  event: KitchenEvent;
  defaultOpen?: boolean;
  /** Bosh sahifadagi "keyingi to'y" — kattaroq va oltin bezakli. */
  hero?: boolean;
}

/** To'y oshpaz nigohida: qachon, necha kishi, nima pishadi va bozorligi yozilganmi. */
export function KitchenEventCard({ event, defaultOpen = false, hero = false }: Props) {
  const { t } = useTranslation();
  const language = useLocaleStore((state) => state.language);
  const [open, setOpen] = useState(defaultOpen);
  const date = inAppZone(event.startAt);
  const days = daysUntil(event.day);
  const soon = days <= 1;
  const lists = event.lists;
  const sections = event.menu?.sections ?? [];

  return (
    <article
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-card shadow-soft',
        hero ? 'border-gold/45' : soon && 'border-primary/40',
      )}
    >
      {hero && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,color-mix(in_oklab,var(--color-gold)_22%,transparent),transparent_60%)]"
        />
      )}
      <div className="relative flex gap-3.5 p-4">
        <div
          className={cn(
            'flex shrink-0 flex-col items-center justify-center rounded-xl py-2',
            hero ? 'w-16' : 'w-14',
            soon ? 'bg-primary text-primary-foreground' : 'bg-muted',
          )}
        >
          <span className="text-[10px] font-bold uppercase opacity-80">{date.format('dd')}</span>
          <span
            className={cn(
              'tabular font-display leading-none font-semibold',
              hero ? 'text-3xl' : 'text-2xl',
            )}
          >
            {date.format('D')}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-semibold">{event.title ?? event.clientName}</p>
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold',
                soon
                  ? 'bg-primary/10 text-primary dark:text-gold-light'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {days <= 0
                ? t('kitchen.when.today')
                : days === 1
                  ? t('kitchen.when.tomorrow')
                  : t('kitchen.when.inDays', { count: days })}
            </span>
          </div>
          <p className="tabular text-xs text-muted-foreground">
            {date.format('D MMMM, dddd')} · {formatTime(event.startAt)} · {event.hallName}
          </p>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5 text-muted-foreground" />
              <b className="tabular">{event.guestCount}</b> {t('kitchen.guests')}
            </span>
            {event.tableCapacity && (
              <span className="text-muted-foreground">
                {t('events.tableSeats', { count: event.tableCapacity })}
              </span>
            )}
          </p>
        </div>
      </div>

      {event.firstDish || event.secondDish ? (
        <div className="relative grid grid-cols-2 gap-2 border-t px-4 py-3">
          {(
            [
              ['shopping.firstDish', event.firstDish],
              ['shopping.secondDish', event.secondDish],
            ] as const
          ).map(([label, dish]) => (
            <div key={label} className="rounded-xl border border-gold/30 bg-gold/8 px-3 py-2">
              <p className="text-[10px] font-bold tracking-wider text-gold-dark uppercase dark:text-gold-light">
                {t(label)}
              </p>
              <p className="font-display text-base leading-tight font-semibold [overflow-wrap:anywhere] sm:text-lg">
                {dish ?? '—'}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="relative flex items-center gap-2 border-t bg-gold/6 px-4 py-2.5 text-sm text-gold-dark dark:text-gold-light">
          <AlertTriangle className="size-4 shrink-0" />
          {t('kitchen.dishesMissing')}
        </p>
      )}

      {event.menu && (
        <>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="relative flex w-full cursor-pointer items-center justify-between gap-2 border-t px-4 py-2.5 text-sm outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
          >
            <span className="flex min-w-0 items-center gap-2">
              <UtensilsCrossed className="size-4 shrink-0 text-gold-dark dark:text-gold-light" />
              <span className="truncate font-semibold">{event.menu.name}</span>
            </span>
            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition',
                open && 'rotate-180',
              )}
            />
          </button>
          {open && (
            <div className="relative grid gap-3 border-t bg-muted/30 px-4 py-3">
              {sections.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('shopping.noMenu')}</p>
              ) : (
                sections.map((section) => (
                  <div key={section.nameUz}>
                    <p className="text-[11px] font-bold tracking-wide text-gold-dark uppercase dark:text-gold-light">
                      {localizedName(section, language)}
                      {section.kindsCount > 1 &&
                        ` · ${t('menu.kinds', { count: section.kindsCount })}`}
                    </p>
                    {section.items.length > 0 && (
                      <ol className="mt-1 grid gap-0.5 text-sm">
                        {section.items.map((item, index) => (
                          <li key={item} className="flex gap-2">
                            <span className="tabular w-5 shrink-0 text-right text-muted-foreground">
                              {index + 1}.
                            </span>
                            <span className="min-w-0">{item}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      <div className="relative flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5">
        {lists.length > 0 ? (
          <Link
            to={`${ROUTES.kitchenShopping}?tab=mine`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-success"
          >
            <Check className="size-4" />
            {t('kitchen.listWritten', { count: lists.length })}
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gold-dark dark:text-gold-light">
            <ClipboardList className="size-4" />
            {t('kitchen.listMissing')}
          </span>
        )}
        <Button asChild size="sm">
          <Link to={`${ROUTES.kitchenShopping}?event=${event.id}`}>
            <Plus />
            {t(lists.length > 0 ? 'kitchen.writeMore' : 'kitchen.writeList')}
          </Link>
        </Button>
      </div>
    </article>
  );
}
