import type { BadgeProps } from '@/components/ui/badge';
import type { ShoppingStatus } from '../types/shopping.types';

/** Holat belgisining rangi: kutilayotgan ish — sariq/oltin, tugagani — yashil. */
export const STATUS_VARIANT: Record<ShoppingStatus, NonNullable<BadgeProps['variant']>> = {
  SUBMITTED: 'warning',
  APPROVED: 'gold',
  PURCHASED: 'default',
  CONFIRMED: 'success',
};
