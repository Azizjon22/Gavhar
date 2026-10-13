import type { ShoppingStatus } from '@/features/shopping/types/shopping.types';
import type { ProductCategory, WarehouseUnit } from '@/features/warehouse/types/warehouse.types';
import { inAppZone } from '@/lib/format';

/** Bugundan necha kun keyin (Toshkent bo'yicha, kalendar kuni). `day` — `YYYY-MM-DD`. */
export const daysUntil = (day: string): number =>
  inAppZone(`${day}T12:00:00+05:00`).startOf('day').diff(inAppZone().startOf('day'), 'day');

/**
 * Kg mahsulot ikki xil yoziladi: butun kilogramm (15, 16) yoki mayda narsalar uchun
 * gramm (100, 200). Miqdor har doim kg da saqlanadi — gramm faqat yozish usuli.
 */
export type KgMode = 'kg' | 'g';
export const GRAM_STEP = 0.05;

/** Ziravor gramlab olinadi, qolgani — kilogrammlab. */
export const defaultKgMode = (category: ProductCategory | null | undefined): KgMode =>
  category === 'SPICE' ? 'g' : 'kg';

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** Saqlangan miqdor (kg) kiritish maydonida qanday ko'rinadi. */
export function toInput(amount: number, unit: WarehouseUnit, mode: KgMode): string {
  if (amount <= 0) return '';
  if (unit === 'KG')
    return mode === 'g' ? String(Math.round(amount * 1000)) : String(round3(amount));
  return String(round3(amount));
}

/** Yozilgan matnni saqlanadigan miqdorga aylantiradi: gramm → kg, donalar — butun. */
export function fromInput(text: string, unit: WarehouseUnit, mode: KgMode): number {
  const value = Number(text.replace(',', '.').replace(/\s/g, ''));
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (unit === 'KG') return mode === 'g' ? Math.round(value) / 1000 : round3(value);
  if (unit === 'LITER') return round3(value);
  return Math.round(value);
}

/** "+" yoki "−" bir bosilganda qanchaga o'zgaradi. */
export function stepSize(unit: WarehouseUnit, mode: KgMode, current: number, dir: 1 | -1): number {
  if (unit === 'KG') return mode === 'g' ? GRAM_STEP : 1;
  if (unit === 'LITER') return current < 1 || (dir === -1 && current <= 1) ? 0.5 : 1;
  return 1;
}

export const addStep = (unit: WarehouseUnit, mode: KgMode, current: number, dir: 1 | -1): number =>
  Math.max(0, round3(current + dir * stepSize(unit, mode, current, dir)));

/**
 * Mehmon soniga moslab ko'paytirilgan miqdor yoziladigan ko'rinishda qoladi: butun
 * kilogramm (1 kg dan kami — 50 g qadam), yarim litr, butun dona.
 */
export function roundFor(unit: WarehouseUnit, value: number): number {
  if (unit === 'KG') {
    return value < 1
      ? Math.max(GRAM_STEP, round3(Math.round(value / GRAM_STEP) * GRAM_STEP))
      : Math.round(value);
  }
  if (unit === 'LITER') return Math.max(0.5, Math.round(value * 2) / 2);
  return Math.max(1, Math.ceil(value));
}

/** Serverga boradigan miqdor satri. */
export const quantityValue = (value: number): string => String(round3(value));

/** Ro'yxat qadamlari: yuborildi → ko'rildi → adminga yuborildi → olindi → tasdiqlandi. */
export const LIST_STEPS = ['SUBMITTED', 'REVIEWED', 'APPROVED', 'PURCHASED', 'CONFIRMED'] as const;
export const listStepIndex = (status: ShoppingStatus): number => LIST_STEPS.indexOf(status);

/** Mahsulot turi muqovasi (oshpaz katalogi uchun). */
export const categoryCover = (category: ProductCategory | null): string =>
  `/kitchen/categories/${(category ?? 'OTHER').toLowerCase()}.jpg`;

export const nameKey = (name: string): string => name.trim().toLowerCase();
