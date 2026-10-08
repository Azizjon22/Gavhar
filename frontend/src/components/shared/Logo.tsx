import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useBrand } from '@/features/settings/api/brand.api';
import { cn } from '@/lib/utils';
import { SpinningGem } from './SpinningGem';

/** Gavhar belgisi: oltin chiziqli qirrali tosh (yassi, harakatsiz ko'rinishi). */
export function GemMark({ className }: { className?: string }) {
  const gradientId = useId();

  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className={cn('size-10', className)}>
      <defs>
        <linearGradient
          id={gradientId}
          x1="8"
          y1="10"
          x2="56"
          y2="56"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#F3DFA2" />
          <stop offset="0.45" stopColor="#C9A24B" />
          <stop offset="1" stopColor="#A9772A" />
        </linearGradient>
      </defs>
      <g stroke={`url(#${gradientId})`} strokeLinejoin="round" strokeLinecap="round">
        <path d="M20 12h24l12 15-24 27L8 27z" strokeWidth="2.4" />
        <path d="M8 27h48" strokeWidth="1.8" />
        <path d="M27 12l-6 15 11 27 11-27-6-15" strokeWidth="1.6" />
        <path d="M20 12l1 15M44 12l-1 15" strokeWidth="1.2" opacity="0.75" />
      </g>
    </svg>
  );
}

interface LogoProps {
  /** Faqat belgi (yig'ilgan sidebar uchun). */
  compact?: boolean;
  className?: string;
}

/** Brend belgisi: logotip yuklangan bo'lsa — o'sha, aks holda aylanayotgan gavhar. */
export function BrandMark({ className }: { className?: string }) {
  const brand = useBrand();
  return brand.logo ? (
    <img src={brand.logo.thumbUrl} alt="" className={cn('size-10 object-contain', className)} />
  ) : (
    <SpinningGem className={className} />
  );
}

export function Logo({ compact = false, className }: LogoProps) {
  const { t } = useTranslation();
  const brand = useBrand();

  return (
    <span className={cn('flex items-center gap-3', className)}>
      <BrandMark className="size-9 shrink-0" />
      {!compact && (
        <span className="flex min-w-0 flex-col leading-none">
          <span className="text-gold-gradient truncate font-display text-2xl font-semibold tracking-tight">
            {brand.name}
          </span>
          <span className="mt-1 truncate text-[10px] font-semibold tracking-[0.22em] text-sidebar-muted uppercase">
            {t('common.brandCaption')}
          </span>
        </span>
      )}
    </span>
  );
}
