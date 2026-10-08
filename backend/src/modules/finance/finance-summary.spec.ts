import { money } from '@/common/utils/money.util';
import { buildSeries, sumAmounts } from './finance-summary';

const row = (day: string, amount: string) => ({ day, amount: money(amount) });

describe('buildSeries', () => {
  it('har bir kun uchun tushum, xarajat va foyda; bo‘sh kunlar nol', () => {
    const series = buildSeries(
      '2026-10-05',
      '2026-10-07',
      'day',
      [row('2026-10-05', '30000000'), row('2026-10-05', '1500000.50'), row('2026-10-07', '100')],
      [row('2026-10-06', '4000000')],
    );

    expect(series).toEqual([
      { key: '2026-10-05', income: '31500000.50', expense: '0.00', profit: '31500000.50' },
      { key: '2026-10-06', income: '0.00', expense: '4000000.00', profit: '-4000000.00' },
      { key: '2026-10-07', income: '100.00', expense: '0.00', profit: '100.00' },
    ]);
  });

  it('yil ko‘rinishida oylar bo‘yicha jamlanadi', () => {
    const series = buildSeries(
      '2026-01-01',
      '2026-03-31',
      'month',
      [row('2026-01-10', '10'), row('2026-01-31', '5'), row('2026-03-01', '7')],
      [row('2026-02-14', '3')],
    );

    expect(series.map((point) => [point.key, point.income, point.expense])).toEqual([
      ['2026-01', '15.00', '0.00'],
      ['2026-02', '0.00', '3.00'],
      ['2026-03', '7.00', '0.00'],
    ]);
  });

  it('kasrli summalarda aniqlik yo‘qolmaydi', () => {
    expect(sumAmounts([row('2026-01-01', '0.1'), row('2026-01-02', '0.2')]).toFixed(2)).toBe(
      '0.30',
    );
  });
});
