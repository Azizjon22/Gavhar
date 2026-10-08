import { describe, expect, it } from 'vitest';
import { amountToInput, formatAmount, parseAmountInput } from './money';

const nbsp = (text: string) => text.replaceAll(' ', ' ');

describe('formatAmount', () => {
  it.each([
    ['15000000.00', '15 000 000'],
    ['1500000', '1 500 000'],
    ['999', '999'],
    ['0.00', '0'],
    ['1234567.5', '1 234 567.50'],
    ['1234567.05', '1 234 567.05'],
    [250000, '250 000'],
    ['9999999999999.99', '9 999 999 999 999.99'],
  ])('%s → %s', (input, expected) => {
    expect(formatAmount(input)).toBe(nbsp(expected));
  });

  it("bo'sh qiymat uchun chiziqcha", () => {
    expect(formatAmount(null)).toBe('—');
    expect(formatAmount('')).toBe('—');
  });
});

describe('parseAmountInput', () => {
  it.each([
    ['15 000 000', '15000000'],
    ['15,000,000 so‘m', '15000000'],
    ['007', '7'],
    ['0', '0'],
    ['abc', ''],
    ['12345678901234567', '1234567890123'],
  ])('%s → %s', (input, expected) => {
    expect(parseAmountInput(input)).toBe(expected);
  });

  it('API qiymatini forma qiymatiga aylantiradi', () => {
    expect(amountToInput('15000000.00')).toBe('15000000');
  });
});
