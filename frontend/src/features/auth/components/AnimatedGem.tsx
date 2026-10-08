import { motion } from 'framer-motion';
import { useId } from 'react';
import { cn } from '@/lib/utils';

const draw = (delay: number, duration: number) =>
  ({
    initial: { pathLength: 0, opacity: 0 },
    animate: { pathLength: 1, opacity: 1 },
    transition: {
      pathLength: { duration, delay, ease: 'easeInOut' },
      opacity: { duration: 0.15, delay },
    },
  }) as const;

/** Login sahifasidagi logotip: gavhar qirralari oltin chiziq bilan "chizilib" chiqadi. */
export function AnimatedGem({ className }: { className?: string }) {
  const gradientId = useId();

  return (
    <span className={cn('relative inline-flex size-20 items-center justify-center', className)}>
      <motion.span
        className="absolute inset-0 rounded-full bg-gold/30 blur-2xl"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: [0.5, 0.9, 0.5], scale: [0.9, 1.1, 0.9] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1.2 }}
        aria-hidden="true"
      />
      <svg viewBox="0 0 64 64" fill="none" className="relative size-full" aria-hidden="true">
        <defs>
          <linearGradient
            id={gradientId}
            x1="8"
            y1="10"
            x2="56"
            y2="56"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#F8E7B4" />
            <stop offset="0.45" stopColor="#D4AE5A" />
            <stop offset="1" stopColor="#A9772A" />
          </linearGradient>
        </defs>
        <g stroke={`url(#${gradientId})`} strokeLinejoin="round" strokeLinecap="round">
          <motion.path d="M20 12h24l12 15-24 27L8 27z" strokeWidth="2.2" {...draw(0.2, 1.3)} />
          <motion.path d="M8 27h48" strokeWidth="1.7" {...draw(0.9, 0.6)} />
          <motion.path d="M27 12l-6 15 11 27 11-27-6-15" strokeWidth="1.5" {...draw(1.1, 0.9)} />
          <motion.path
            d="M20 12l1 15M44 12l-1 15"
            strokeWidth="1.1"
            opacity="0.75"
            {...draw(1.5, 0.5)}
          />
        </g>
      </svg>
    </span>
  );
}
