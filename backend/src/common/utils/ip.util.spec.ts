import { normalizeIp } from './ip.util';

describe('normalizeIp', () => {
  it.each([
    ['::ffff:192.168.1.5', '192.168.1.5'],
    ['::FFFF:10.0.0.1', '10.0.0.1'],
    ['::1', '127.0.0.1'],
    ['203.0.113.7', '203.0.113.7'],
    ['2001:db8::1', '2001:db8::1'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeIp(input)).toBe(expected);
  });

  it("bo'sh qiymat uchun undefined", () => {
    expect(normalizeIp(undefined)).toBeUndefined();
    expect(normalizeIp('')).toBeUndefined();
  });
});
