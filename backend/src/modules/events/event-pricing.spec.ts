import { money } from '@/common/utils/money.util';
import { calculatePricing, requiredDeposit, toUzs } from './event-pricing';

const base = {
  guestCount: 300,
  pricePerGuest: money('180000'),
  discount: money('0'),
  services: [],
};

describe('calculatePricing', () => {
  it('mehmonlar × 1 kishilik narx; zal uchun alohida haq qo‘shilmaydi', () => {
    const result = calculatePricing(base);

    expect(result.guestsTotal.toFixed(2)).toBe('54000000.00');
    expect(result.totalAmount.toFixed(2)).toBe('54000000.00');
  });

  it("xizmatlar: 'bir tadbir uchun' va 'bir mehmon uchun' turlicha hisoblanadi", () => {
    const result = calculatePricing({
      ...base,
      services: [
        { unit: 'PER_EVENT', unitPrice: money('3000000'), quantity: 2 },
        { unit: 'PER_GUEST', unitPrice: money('5000'), quantity: 1 },
      ],
    });

    // 2 × 3 000 000 + 300 × 5 000
    expect(result.extrasTotal.toFixed(2)).toBe('7500000.00');
    expect(result.totalAmount.toFixed(2)).toBe('61500000.00');
  });

  it('chegirma jami summadan ayiriladi', () => {
    const result = calculatePricing({ ...base, discount: money('4000000') });

    expect(result.subtotal.toFixed(2)).toBe('54000000.00');
    expect(result.totalAmount.toFixed(2)).toBe('50000000.00');
  });

  it("chegirma summadan katta bo'lsa rad etiladi", () => {
    expect(() => calculatePricing({ ...base, discount: money('54000000.01') })).toThrow(
      expect.objectContaining({ code: 'DISCOUNT_EXCEEDS_TOTAL' }),
    );
    expect(calculatePricing({ ...base, discount: money('54000000') }).totalAmount.isZero()).toBe(
      true,
    );
  });

  it("kasrli narxlarda aniqlik yo'qolmaydi (float xatosi yo'q)", () => {
    const result = calculatePricing({
      ...base,
      guestCount: 3,
      pricePerGuest: money('0.1'),
      services: [{ unit: 'PER_EVENT', unitPrice: money('0.2'), quantity: 1 }],
    });

    // JS'da 0.1 * 3 + 0.2 = 0.5000000000000001
    expect(result.totalAmount.toFixed(2)).toBe('0.50');
    expect(result.totalAmount.eq(money('0.5'))).toBe(true);
  });
});

describe('requiredDeposit', () => {
  it.each([
    ['69000000', 20, '13800000.00'],
    ['100', 33, '33.00'],
    ['1000.01', 20, '200.01'],
    ['999.99', 0, '0.00'],
    ['500', 100, '500.00'],
  ])('%s ning %d%% = %s', (total, percent, expected) => {
    expect(requiredDeposit(money(total), percent).toFixed(2)).toBe(expected);
  });
});

describe('toUzs', () => {
  it("valyutani kurs bo'yicha so'mga o'giradi va tiyingacha yaxlitlaydi", () => {
    expect(toUzs(money('500'), money('12650.5')).toFixed(2)).toBe('6325250.00');
    expect(toUzs(money('0.01'), money('12650.4567')).toFixed(2)).toBe('126.50');
    expect(toUzs(money('1500000'), money('1')).toFixed(2)).toBe('1500000.00');
  });
});
