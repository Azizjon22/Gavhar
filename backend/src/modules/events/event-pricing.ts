import { ExtraServiceUnit, Prisma } from '@prisma/client';
import { AppException } from '@/common/errors/app.exception';
import { Money, ZERO, roundMoney } from '@/common/utils/money.util';

export interface PricedService {
  unit: ExtraServiceUnit;
  unitPrice: Money;
  quantity: number;
}

export interface PricingInput {
  guestCount: number;
  pricePerGuest: Money;
  discount: Money;
  services: PricedService[];
}

export interface Pricing {
  guestsTotal: Money;
  extrasTotal: Money;
  subtotal: Money;
  totalAmount: Money;
}

/** "Bir mehmon uchun" xizmat mehmonlar soniga ko'paytiriladi. */
export const serviceTotal = (service: PricedService, guestCount: number): Money =>
  service.unit === ExtraServiceUnit.PER_GUEST
    ? service.unitPrice.mul(guestCount).mul(service.quantity)
    : service.unitPrice.mul(service.quantity);

/**
 * Bron summasi:
 *   mehmonlar × 1 kishilik narx + qo'shimcha xizmatlar − chegirma
 * Zal uchun alohida haq olinmaydi — u kishi boshiga narx ichida.
 */
export function calculatePricing(input: PricingInput): Pricing {
  const guestsTotal = input.pricePerGuest.mul(input.guestCount);
  const extrasTotal = input.services.reduce(
    (sum, service) => sum.add(serviceTotal(service, input.guestCount)),
    ZERO,
  );
  const subtotal = guestsTotal.add(extrasTotal);

  if (input.discount.gt(subtotal)) {
    throw AppException.badRequest(
      'DISCOUNT_EXCEEDS_TOTAL',
      'Chegirma bron summasidan katta bo‘lishi mumkin emas',
      { subtotal: subtotal.toFixed(2) },
    );
  }
  return { guestsTotal, extrasTotal, subtotal, totalAmount: subtotal.sub(input.discount) };
}

/** Tasdiqlash uchun kerakli minimal zaklad (tiyingacha yuqoriga yaxlitlanadi). */
export const requiredDeposit = (totalAmount: Money, percent: number): Money =>
  totalAmount.mul(percent).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_UP);

/** Valyutadagi summaning so'mdagi qiymati. */
export const toUzs = (amount: Money, exchangeRate: Money): Money =>
  roundMoney(amount.mul(exchangeRate));
