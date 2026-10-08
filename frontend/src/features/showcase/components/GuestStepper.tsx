import { Minus, Plus, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { GUEST_PRESETS, GUEST_STEP, MAX_GUESTS, MIN_GUESTS, useGuests } from '../lib/guests';

const roundButton =
  'flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/20 text-white transition-colors outline-none hover:border-gold/70 hover:bg-gold/15 focus-visible:ring-[3px] focus-visible:ring-gold/60 disabled:cursor-not-allowed disabled:opacity-35';

/** Mehmonlar soni: − / + va tez tanlash. Jami summalar shu songa qarab hisoblanadi. */
export function GuestStepper({ className }: { className?: string }) {
  const { t } = useTranslation();
  const guests = useGuests((state) => state.guests);
  const setGuests = useGuests((state) => state.setGuests);

  return (
    <div
      role="group"
      aria-label={t('showcase.menu.guests')}
      className={cn(
        'flex w-fit max-w-full flex-col items-center gap-4 rounded-[28px] border border-white/12 bg-white/[0.05] px-6 py-5 backdrop-blur-xl sm:flex-row sm:gap-6 sm:rounded-full sm:py-3 sm:pr-3 sm:pl-7',
        className,
      )}
    >
      <p className="flex items-center gap-2.5 text-sm font-semibold tracking-wide text-white/75">
        <Users className="size-[18px] text-gold-light" />
        {t('showcase.menu.guests')}
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={t('showcase.menu.fewerGuests')}
          disabled={guests <= MIN_GUESTS}
          onClick={() => setGuests(guests - GUEST_STEP)}
          className={roundButton}
        >
          <Minus className="size-5" />
        </button>
        <output
          aria-live="polite"
          className="tabular w-[4.2ch] text-center font-display text-4xl leading-none font-semibold text-white"
        >
          {guests}
        </output>
        <button
          type="button"
          aria-label={t('showcase.menu.moreGuests')}
          disabled={guests >= MAX_GUESTS}
          onClick={() => setGuests(guests + GUEST_STEP)}
          className={roundButton}
        >
          <Plus className="size-5" />
        </button>
      </div>
      <div className="flex gap-1.5">
        {GUEST_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={guests === preset}
            onClick={() => setGuests(preset)}
            className={cn(
              'tabular cursor-pointer rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-gold/60',
              guests === preset
                ? 'bg-gold-gradient border-transparent text-[#1b1407]'
                : 'border-white/15 text-white/70 hover:bg-white/10 hover:text-white',
            )}
          >
            {preset}
          </button>
        ))}
      </div>
    </div>
  );
}
