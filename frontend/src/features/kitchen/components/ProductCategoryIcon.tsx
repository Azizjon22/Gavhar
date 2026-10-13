import {
  Apple,
  Beef,
  Carrot,
  CupSoda,
  Droplet,
  Flame,
  type LucideIcon,
  Milk,
  Package,
  Sprout,
  Wheat,
} from 'lucide-react';
import type { ProductCategory } from '@/features/warehouse/types/warehouse.types';

const ICONS: Record<ProductCategory, LucideIcon> = {
  VEGETABLE: Carrot,
  FRUIT: Apple,
  MEAT: Beef,
  DAIRY: Milk,
  GREENS: Sprout,
  GRAIN: Wheat,
  OIL: Droplet,
  SPICE: Flame,
  DRINK: CupSoda,
  OTHER: Package,
};

/** Oziq-ovqat turi belgisi (oshpaz katalogi va ombor tanlovida). */
export function ProductCategoryIcon({
  category,
  className,
}: {
  category: ProductCategory | null;
  className?: string;
}) {
  const Icon = ICONS[category ?? 'OTHER'];
  return <Icon className={className} aria-hidden />;
}
