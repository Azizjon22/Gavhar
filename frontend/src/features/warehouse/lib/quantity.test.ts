import { describe, expect, it } from 'vitest';
import {
  formatQuantity,
  isPositiveQuantity,
  parseQuantityInput,
  toQuantityValue,
} from './quantity';

describe('formatQuantity', () => {
  it.each([
    ['300', '300'],
    ['1250.5', '1 250,5'],
    ['0.125', '0,125'],
    ['1000000', '1 000 000'],
    [null, '0'],
  ])('%s → %s', (input, expected) => {
    expect(formatQuantity(input)).toBe(expected);
  });
});

describe('parseQuantityInput', () => {
  it('kasrli birlikda vergul va nuqtani qabul qiladi, 3 xonagacha', () => {
    expect(parseQuantityInput('12,5', true)).toBe('12.5');
    expect(parseQuantityInput('12.3456', true)).toBe('12.345');
    expect(parseQuantityInput('.5', true)).toBe('0.5');
    expect(parseQuantityInput('1.2.3', true)).toBe('1.23');
    expect(parseQuantityInput('12.', true)).toBe('12.');
  });

  it('donalab sanaladigan birlikda kasr kiritilmaydi', () => {
    expect(parseQuantityInput('12,5', false)).toBe('12');
    expect(parseQuantityInput('007', false)).toBe('7');
    expect(parseQuantityInput('abc', false)).toBe('');
  });
});

describe('toQuantityValue / isPositiveQuantity', () => {
  it('ortiqcha nol va nuqtani olib tashlaydi', () => {
    expect(toQuantityValue('12.')).toBe('12');
    expect(toQuantityValue('12.50')).toBe('12.5');
    expect(toQuantityValue('100')).toBe('100');
  });

  it('nol va bo‘sh qiymat yaroqsiz', () => {
    expect(isPositiveQuantity('12.5')).toBe(true);
    expect(isPositiveQuantity('12.')).toBe(true);
    expect(isPositiveQuantity('0')).toBe(false);
    expect(isPositiveQuantity('0.000')).toBe(false);
    expect(isPositiveQuantity('')).toBe(false);
  });
});
