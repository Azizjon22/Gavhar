import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ROUTES } from '@/app/router/paths';
import type { Dish } from '@/features/menu/api/dishes.api';
import type { MenuPackage } from '@/features/menu/types/menu.types';
import { formatAmount } from '@/lib/money';
import { cn } from '@/lib/utils';
import { useGuests } from '../lib/guests';
import { dishCount, packageCover, packageTotal, romanNumeral } from '../lib/package';
import { PackageCoverArt } from './Ornaments';

interface PackageShowCardProps {
  pkg: MenuPackage;
  index: number;
  dishes: Map<string, Dish>;
}

/**
 * Taqdimotdagi paket kartasi: muqova rasmi ustida nom, 1 kishilik narx va tanlangan
 * mehmonlar soni uchun jami summa. Bosilganda paketning to'liq menyusi ochiladi.
 */
export function PackageShowCard({ pkg, index, dishes }: PackageShowCardProps) {
  const { t } = useTranslation();
  const guests = useGuests((state) => state.guests);
  const featured = Boolean(pkg.badge);

  return (
    <Link
      to={`${ROUTES.showcaseMenu}/${pkg.id}`}
      className={cn(
        'group @container relative flex aspect-[4/5] w-full flex-col justify-end overflow-hidden rounded-[28px] text-white shadow-[0_40px_90px_-45px_rgba(0,0,0,0.95)] ring-1 transition-all duration-500 outline-none hover:-translate-y-1.5 focus-visible:ring-[3px] focus-visible:ring-gold/80 sm:aspect-[3/4]',
        featured
          ? 'shadow-[0_40px_90px_-40px_rgba(201,162,75,0.55)] ring-gold/70'
          : 'ring-white/10 hover:ring-gold/50',
      )}
    >
      <PackageCoverArt
        src={packageCover(pkg, dishes)}
        alt=""
        imageClassName="transition-transform duration-[1400ms] ease-out group-hover:scale-[1.07]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#03110d] from-32% via-[#03110d]/75 via-58% to-[#03110d]/5" />
      {featured && (
        <div className="pointer-events-none absolute inset-2 rounded-[22px] border border-gold/45" />
      )}

      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-gold-light/45 bg-black/35 font-display text-lg font-semibold text-gold-light backdrop-blur-md">
          {romanNumeral(index)}
        </span>
        {pkg.badge && (
          <span className="bg-gold-gradient truncate rounded-full px-4 py-1.5 text-xs font-bold tracking-[0.18em] text-[#1b1407] uppercase shadow-lg shadow-black/40">
            {pkg.badge}
          </span>
        )}
      </div>

      <div className="relative p-[clamp(1.25rem,7cqw,2rem)]">
        <h3 className="font-display text-[clamp(1.75rem,11cqw,3.25rem)] leading-[1.05] font-semibold tracking-tight [overflow-wrap:anywhere]">
          {pkg.name}
        </h3>
        {pkg.description && (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-white/65">
            {pkg.description}
          </p>
        )}
        <div className="mt-4 h-px w-full bg-gradient-to-r from-gold/70 via-gold/25 to-transparent" />

        <div className="mt-4 flex items-end justify-between gap-3">
          <p>
            <span className="text-gilded tabular block font-display text-[clamp(2.1rem,13cqw,3.75rem)] leading-none font-semibold">
              {formatAmount(pkg.pricePerGuest)}
            </span>
            <span className="mt-2 block text-[11px] font-medium tracking-[0.2em] text-white/60 uppercase">
              {t('showcase.menu.perGuest')}
            </span>
          </p>
          <span
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/5 backdrop-blur transition-all duration-300 group-hover:border-transparent group-hover:bg-gold-light group-hover:text-[#1b1407]"
          >
            <ArrowRight className="size-5 transition-transform duration-300 group-hover:translate-x-0.5" />
          </span>
        </div>

        <p className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 backdrop-blur-md">
          <span className="text-xs text-white/60">
            {t('showcase.menu.totalFor', { count: guests })}
          </span>
          <span className="tabular text-sm font-semibold whitespace-nowrap text-white">
            {formatAmount(packageTotal(pkg.pricePerGuest, guests))} {t('common.currency')}
          </span>
        </p>
        <p className="mt-3 text-xs text-white/50">
          {t('showcase.menu.dishCount', { count: dishCount(pkg) })}
          <span className="mx-2 text-gold">·</span>
          <span className="font-semibold text-gold-light/85 transition-colors group-hover:text-gold-light">
            {t('showcase.menu.view')}
          </span>
        </p>
      </div>
    </Link>
  );
}
