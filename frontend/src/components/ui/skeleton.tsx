import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Yuklanayotgan kontent o'rnida turadigan, yaltirab o'tuvchi to'ldirgich. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-shimmer rounded-md bg-[linear-gradient(90deg,var(--muted)_25%,var(--accent)_50%,var(--muted)_75%)] bg-[length:200%_100%]',
        className,
      )}
      {...props}
    />
  );
}
