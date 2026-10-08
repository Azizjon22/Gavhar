import { describe, expect, it } from 'vitest';
import { canGoForward, periodRange, shiftPeriod } from './period';

describe('periodRange', () => {
  it('hafta dushanbadan yakshanbagacha', () => {
    // 2026-10-07 — chorshanba.
    expect(periodRange('week', '2026-10-07')).toEqual({
      from: '2026-10-05',
      to: '2026-10-11',
      groupBy: 'day',
    });
    // Yakshanba o'z haftasida qoladi.
    expect(periodRange('week', '2026-10-11').from).toBe('2026-10-05');
  });

  it('oy va yil', () => {
    expect(periodRange('month', '2028-02-10')).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
      groupBy: 'day',
    });
    expect(periodRange('year', '2026-10-07')).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
      groupBy: 'month',
    });
  });
});

describe('shiftPeriod', () => {
  it('oldingi va keyingi davrga o‘tadi', () => {
    expect(shiftPeriod('week', '2026-10-07', -1)).toBe('2026-09-28');
    expect(shiftPeriod('month', '2026-01-31', 1)).toBe('2026-02-01');
    expect(shiftPeriod('month', '2026-01-15', -1)).toBe('2025-12-01');
    expect(shiftPeriod('year', '2026-10-07', 1)).toBe('2027-01-01');
  });
});

describe('canGoForward', () => {
  it('butunlay kelajakdagi davrga o‘tkazmaydi', () => {
    expect(canGoForward('month', '2026-09-10', '2026-10-07')).toBe(true);
    expect(canGoForward('month', '2026-10-01', '2026-10-07')).toBe(false);
    expect(canGoForward('week', '2026-09-30', '2026-10-07')).toBe(true);
    expect(canGoForward('year', '2026-03-01', '2026-10-07')).toBe(false);
  });
});
