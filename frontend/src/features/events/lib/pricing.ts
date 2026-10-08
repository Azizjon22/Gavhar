import type { ExtraServiceUnit } from '@/features/extra-services/types/extra-service.types';

export interface PricingLine {
  unit: ExtraServiceUnit;
  /** Butun so'm. */
  unitPrice: number;
  quantity: number;
}

export interface PricingPreview {
  guestsTotal: number;
  extrasTotal: number;
  subtotal: number;
  total: number;
  deposit: number;
}

/** "180000.00" yoki "180000" → 180000. Bo'sh qiymat — 0. */
export const toSum = (value: string | undefined): number => {
  const integer = Number((value ?? '').split('.')[0]);
  return Number.isSafeInteger(integer) && integer > 0 ? integer : 0;
};

/**
 * Formadagi jonli hisob — faqat ko'rsatish uchun. Butun so'mlar ustida
 * ishlaydi (JS'da 9·10¹⁵ gacha aniq). Yakuniy summa har doim serverda hisoblanadi.
 */
export function previewPricing(input: {
  guestCount: number;
  pricePerGuest: number;
  discount: number;
  services: PricingLine[];
  depositPercent: number;
}): PricingPreview {
  const guestsTotal = input.guestCount * input.pricePerGuest;
  const extrasTotal = input.services.reduce(
    (sum, line) =>
      sum +
      (line.unit === 'PER_GUEST'
        ? line.unitPrice * input.guestCount * line.quantity
        : line.unitPrice * line.quantity),
    0,
  );
  const subtotal = guestsTotal + extrasTotal;
  const total = Math.max(0, subtotal - input.discount);

  return {
    guestsTotal,
    extrasTotal,
    subtotal,
    total,
    deposit: Math.ceil((total * input.depositPercent) / 100),
  };
}
