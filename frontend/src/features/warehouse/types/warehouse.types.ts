export const WAREHOUSE_SECTIONS = ['TABLEWARE', 'FOOD'] as const;
export type WarehouseSection = (typeof WAREHOUSE_SECTIONS)[number];

export const WAREHOUSE_UNITS = ['PIECE', 'KG', 'LITER', 'PACK', 'BOX', 'SET'] as const;
export type WarehouseUnit = (typeof WAREHOUSE_UNITS)[number];

/** Donalab sanaladigan birliklar — kasr miqdor kiritilmaydi. */
export const isWholeUnit = (unit: WarehouseUnit): boolean => unit !== 'KG' && unit !== 'LITER';

/** Oziq-ovqat mahsulotining turi. */
export const PRODUCT_CATEGORIES = [
  'VEGETABLE',
  'FRUIT',
  'MEAT',
  'DAIRY',
  'GREENS',
  'GRAIN',
  'OIL',
  'SPICE',
  'DRINK',
  'OTHER',
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export type MovementType = 'IN' | 'OUT';

export interface WarehouseItem {
  id: string;
  section: WarehouseSection;
  /** Faqat oziq-ovqatda. */
  productCategory: ProductCategory | null;
  /** Muddatli imzolangan havolalar. */
  photo: { url: string; thumbUrl: string } | null;
  name: string;
  unit: WarehouseUnit;
  /** Miqdor satr ko'rinishida: "12.5", "300". */
  quantity: string;
  minQuantity: string;
  /** Qoldiq belgilangan chegaraga tushgan. */
  isLow: boolean;
  note: string | null;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  type: MovementType;
  quantity: string;
  balanceAfter: string;
  totalCost: string | null;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface ItemPayload {
  name: string;
  unit: WarehouseUnit;
  productCategory?: ProductCategory | null;
  minQuantity: string;
  note: string | null;
}

export interface CreateItemPayload extends ItemPayload {
  section: WarehouseSection;
  initialQuantity?: string;
}

/** Butun ombor lentasidagi harakat — qaysi mahsulotniki ekani bilan. */
export interface RecentMovement extends StockMovement {
  item: { id: string; name: string; unit: WarehouseUnit; section: WarehouseSection };
}

export interface MovementPayload {
  type: MovementType;
  quantity: string;
  totalCost?: string;
  note: string | null;
}
