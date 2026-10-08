import type { HTMLAttributes } from 'react';
import { cn, initials } from '@/lib/utils';

interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = { sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-14 text-lg' } as const;

/** Ism bosh harflaridan yasalgan oltin avatar. */
export function Avatar({ name, size = 'md', className, ...props }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'bg-gold-gradient inline-flex shrink-0 items-center justify-center rounded-full font-bold tracking-wide text-[#1b1407] select-none',
        SIZES[size],
        className,
      )}
      {...props}
    >
      {initials(name)}
    </span>
  );
}
