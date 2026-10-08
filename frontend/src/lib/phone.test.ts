import { describe, expect, it } from 'vitest';
import { extractLocalPhone, formatLocalPhone, formatPhone, toPhoneValue } from './phone';

describe('phone', () => {
  it("to'liq raqamni guruhlab ko'rsatadi", () => {
    expect(formatPhone('+998901234567')).toBe('+998 90 123 45 67');
    expect(formatPhone(null)).toBe('—');
    expect(formatPhone('+7 900 000')).toBe('+7 900 000');
  });

  it("yozilayotgan (to'liq bo'lmagan) raqamni ham guruhlaydi", () => {
    expect(formatLocalPhone('9')).toBe('9');
    expect(formatLocalPhone('9012')).toBe('90 12');
    expect(formatLocalPhone('901234567')).toBe('90 123 45 67');
  });

  it.each([
    ['90 123 45 67', '901234567'],
    ['+998 (90) 123-45-67', '901234567'],
    ['998901234567', '901234567'],
    ['9012345678999', '901234567'],
    ['998', '998'],
    ['abc', ''],
  ])('kiritilgan "%s" dan mahalliy raqam: %s', (input, expected) => {
    expect(extractLocalPhone(input)).toBe(expected);
  });

  it('forma qiymati', () => {
    expect(toPhoneValue('901234567')).toBe('+998901234567');
    expect(toPhoneValue('')).toBe('');
  });
});
