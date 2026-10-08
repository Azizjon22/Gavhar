import { describe, expect, it } from 'vitest';
import { previewPricing, toSum } from './pricing';

const base = {
  guestCount: 300,
  pricePerGuest: 230_000,
  discount: 0,
  services: [],
  depositPercent: 20,
};

describe('previewPricing', () => {
  it('server bilan bir xil formula: mehmonlar × narx + xizmatlar − chegirma (zal uchun alohida haq yo‘q)', () => {
    const result = previewPricing({
      ...base,
      discount: 4_500_000,
      services: [
        { unit: 'PER_EVENT', unitPrice: 3_000_000, quantity: 1 },
        { unit: 'PER_GUEST', unitPrice: 5_000, quantity: 1 },
      ],
    });

    expect(result).toEqual({
      guestsTotal: 69_000_000,
      extrasTotal: 4_500_000,
      subtotal: 73_500_000,
      total: 69_000_000,
      deposit: 13_800_000,
    });
  });

  it('chegirma summadan katta bo‘lsa jami manfiy bo‘lmaydi', () => {
    expect(previewPricing({ ...base, discount: 999_000_000 }).total).toBe(0);
  });

  it('zaklad yuqoriga yaxlitlanadi', () => {
    expect(previewPricing({ ...base, guestCount: 1, pricePerGuest: 1 }).deposit).toBe(1);
  });
});

describe('toSum', () => {
  it.each([
    ['15000000.00', 15_000_000],
    ['180000', 180_000],
    ['', 0],
    [undefined, 0],
    ['abc', 0],
  ])('%s → %d', (input, expected) => {
    expect(toSum(input)).toBe(expected);
  });
});
