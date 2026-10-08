import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { GemMark } from '@/components/shared/Logo';
import { cn } from '@/lib/utils';

const EASE = [0.22, 1, 0.36, 1] as const;

/** Ekranga kirganda pastdan sekin ko'tarilib chiqadi (bir marta). */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 36 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.8, ease: EASE, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Ingichka chiziq — gavhar — ingichka chiziq. Rangi matn rangidan olinadi. */
export function GemDivider({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-3', className)} aria-hidden="true">
      <span className="h-px w-14 bg-gradient-to-r from-transparent to-current opacity-60 sm:w-24" />
      <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none">
        <path d="M7 4h10l5 6-10 11L2 10z" fill="currentColor" fillOpacity="0.25" />
        <path
          d="M7 4h10l5 6-10 11L2 10zM2 10h20M9.5 4 7.5 10 12 21l4.5-11-2-6"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
      </svg>
      <span className="h-px w-14 bg-gradient-to-l from-transparent to-current opacity-60 sm:w-24" />
    </div>
  );
}

/** Menyu varag'ining burchak naqshi (chap-yuqori; boshqalari burib qo'yiladi). */
export function CornerFlourish({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 56 56"
      className={cn('pointer-events-none absolute size-11 sm:size-14', className)}
      fill="none"
      aria-hidden="true"
    >
      <path d="M2 54V16C2 8 8 2 16 2h38" stroke="currentColor" strokeWidth="1.2" />
      <path d="M9 54V20c0-6 5-11 11-11h34" stroke="currentColor" strokeWidth="0.7" opacity="0.55" />
      <path d="m20 14 6 6-6 6-6-6z" fill="currentColor" />
      <circle cx="34" cy="20" r="1.4" fill="currentColor" opacity="0.7" />
      <circle cx="20" cy="34" r="1.4" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text?: string;
}) {
  return (
    <Reveal className="mx-auto mb-12 max-w-2xl text-center">
      <p className="mb-4 flex items-center justify-center gap-3 text-xs font-bold tracking-[0.32em] text-gold-light/90 uppercase">
        <span className="h-px w-8 bg-gradient-to-r from-transparent to-gold-light/80" />
        {eyebrow}
        <span className="h-px w-8 bg-gradient-to-l from-transparent to-gold-light/80" />
      </p>
      <h2 className="font-display text-4xl leading-tight font-semibold tracking-tight text-white sm:text-5xl">
        {title}
      </h2>
      {text && <p className="mt-4 text-base leading-relaxed text-white/60">{text}</p>}
    </Reveal>
  );
}

/**
 * Paket muqovasi. Rasm bo'lmasa — zumrad fon, oltin shu'la va yirik gavhar:
 * rasm yuklanmagan paket ham "bo'sh" ko'rinmaydi.
 */
export function PackageCoverArt({
  src,
  alt,
  className,
  imageClassName,
}: {
  src: string | null;
  alt: string;
  className?: string;
  imageClassName?: string;
}) {
  return (
    <div className={cn('absolute inset-0 overflow-hidden bg-[#082019]', className)}>
      {src ? (
        <img src={src} alt={alt} className={cn('size-full object-cover', imageClassName)} />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(90%_70%_at_50%_18%,#1b6a52_0%,#0b2f25_55%,#061a14_100%)]">
          <div className="absolute inset-x-0 top-0 h-2/3 bg-[radial-gradient(60%_60%_at_50%_30%,rgba(230,199,122,0.28),transparent_70%)]" />
          <GemMark className="absolute top-[11%] left-1/2 size-[32%] max-w-52 -translate-x-1/2 opacity-40" />
        </div>
      )}
    </div>
  );
}
