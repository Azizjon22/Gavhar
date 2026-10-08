import type { BadgeProps } from '@/components/ui/badge';
import type { EventStatus } from '../types/event.types';

export const STATUS_VARIANT: Record<EventStatus, NonNullable<BadgeProps['variant']>> = {
  REQUEST: 'warning',
  CONFIRMED: 'success',
  HELD: 'gold',
  COMPLETED: 'secondary',
  CANCELLED: 'destructive',
};

/** Kalendar katakchalari uchun: holat bo'yicha fon va matn rangi. */
export const STATUS_CHIP: Record<EventStatus, string> = {
  REQUEST: 'bg-warning/15 text-warning hover:bg-warning/25',
  CONFIRMED: 'bg-success/15 text-success hover:bg-success/25',
  HELD: 'bg-gold/20 text-gold-dark hover:bg-gold/30 dark:text-gold-light',
  COMPLETED: 'bg-secondary text-secondary-foreground hover:bg-accent',
  CANCELLED: 'bg-destructive/10 text-destructive line-through opacity-70 hover:opacity-100',
};
