import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Bo'sh holatlar uchun illustratsiya: yaltirab turgan gavhar. */
function EmptyIllustration() {
  return (
    <svg viewBox="0 0 160 120" fill="none" aria-hidden="true" className="h-28 w-auto">
      <ellipse cx="80" cy="104" rx="46" ry="6" className="fill-foreground/[0.06]" />
      <circle cx="80" cy="56" r="44" className="fill-gold/[0.08]" />
      <circle cx="80" cy="56" r="30" className="fill-gold/[0.09]" />
      <g className="stroke-gold" strokeLinejoin="round" strokeLinecap="round">
        <path d="M64 34h32l16 20-32 36-32-36z" strokeWidth="2.5" className="fill-card" />
        <path d="M48 54h64M73 34l-8 20 15 36 15-36-8-20" strokeWidth="1.8" />
      </g>
      <g className="fill-gold-light">
        <path d="M128 22l2.2 6.3 6.3 2.2-6.3 2.2-2.2 6.3-2.2-6.3-6.3-2.2 6.3-2.2z" />
        <path d="M30 30l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4-4.4-1.6 4.4-1.6z" opacity="0.8" />
        <path d="M136 72l1.2 3.3 3.3 1.2-3.3 1.2-1.2 3.3-1.2-3.3-3.3-1.2 3.3-1.2z" opacity="0.6" />
      </g>
    </svg>
  );
}

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 px-6 py-14 text-center',
        className,
      )}
    >
      <EmptyIllustration />
      <div className="space-y-1.5">
        <p className="font-display text-xl font-semibold">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
