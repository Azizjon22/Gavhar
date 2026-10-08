import { ArrowLeft, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ROUTES } from '@/app/router/paths';
import { LanguageSwitch } from '@/components/layout/LanguageSwitch';
import { BrandMark } from '@/components/shared/Logo';
import { useBrand } from '@/features/settings/api/brand.api';

const focusRing = 'outline-none focus-visible:ring-[3px] focus-visible:ring-gold/50';

interface ShowcaseHeaderProps {
  /** Brend bosilganda ochiladigan manzil (bosh taqdimot yoki sahifa boshi). */
  home: string;
  /** O'rtadagi bo'lim havolalari. */
  children?: ReactNode;
  /** Ichki sahifada "orqaga" havolasi. */
  back?: { to: string; label: string };
}

/** Taqdimotning doimiy tepa qismi: brend, bo'limlar, til va yopish. */
export function ShowcaseHeader({ home, children, back }: ShowcaseHeaderProps) {
  const { t } = useTranslation();
  const brand = useBrand();

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-white/10 bg-[#061a14]/80 px-5 py-3 backdrop-blur-xl sm:px-8">
      <Link to={home} className={`flex items-center gap-2.5 rounded-lg ${focusRing}`}>
        <BrandMark className="size-8" />
        <span className="text-gold-gradient font-display text-2xl font-semibold tracking-tight">
          {brand.name}
        </span>
      </Link>
      <nav
        aria-label={t('showcase.title')}
        className="order-last flex w-full items-center justify-start gap-1 overflow-x-auto whitespace-nowrap min-[420px]:justify-center md:order-none md:w-auto"
      >
        {back && (
          <Link
            to={back.to}
            className={`flex shrink-0 items-center gap-2 rounded-full border border-white/15 px-3.5 py-1.5 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white md:py-2 ${focusRing}`}
          >
            <ArrowLeft className="size-4" />
            {back.label}
          </Link>
        )}
        {children}
      </nav>
      <div className="flex items-center gap-1">
        <LanguageSwitch onDark />
        <Link
          to={ROUTES.home}
          aria-label={t('showcase.close')}
          title={t('showcase.close')}
          className={`flex size-9 items-center justify-center rounded-lg text-white/75 transition-colors hover:bg-white/10 hover:text-white ${focusRing}`}
        >
          <X className="size-5" />
        </Link>
      </div>
    </header>
  );
}

/** Tepa qismdagi bo'lim havolasi. */
export function ShowcaseNavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold text-white/70 sm:px-4 transition-colors hover:bg-white/10 hover:text-white md:py-2 ${focusRing}`}
    >
      {children}
    </a>
  );
}
