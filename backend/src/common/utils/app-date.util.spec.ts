import {
  addDays,
  diffDays,
  eachDay,
  eachMonth,
  isValidDate,
  localDate,
  startOfLocalDay,
} from './app-date.util';

const TASHKENT = 'Asia/Tashkent';

describe('app-date', () => {
  it('lahzaning Toshkent bo‘yicha sanasi (UTC+5)', () => {
    expect(localDate(new Date('2026-10-07T18:59:59Z'), TASHKENT)).toBe('2026-10-07');
    expect(localDate(new Date('2026-10-07T19:00:00Z'), TASHKENT)).toBe('2026-10-08');
  });

  it('kun boshi — mahalliy 00:00', () => {
    expect(startOfLocalDay('2026-10-08', TASHKENT).toISOString()).toBe('2026-10-07T19:00:00.000Z');
    expect(startOfLocalDay('2026-01-01', 'UTC').toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('yozgi vaqtga o‘tadigan zonada ham kun boshi to‘g‘ri', () => {
    // Berlinda 2026-03-29 da soat oldinga suriladi.
    expect(startOfLocalDay('2026-03-29', 'Europe/Berlin').toISOString()).toBe(
      '2026-03-28T23:00:00.000Z',
    );
    expect(startOfLocalDay('2026-03-30', 'Europe/Berlin').toISOString()).toBe(
      '2026-03-29T22:00:00.000Z',
    );
  });

  it('mavjud bo‘lmagan sanalarni rad etadi', () => {
    expect(isValidDate('2026-02-28')).toBe(true);
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('07.10.2026')).toBe(false);
  });

  it('kunlar va oylar ro‘yxati', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(diffDays('2026-10-01', '2026-10-31')).toBe(30);
    expect(eachDay('2026-02-27', '2026-03-01')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01']);
    expect(eachDay('2026-03-02', '2026-03-01')).toEqual([]);
    expect(eachMonth('2026-11-15', '2027-02-01')).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
  });
});
