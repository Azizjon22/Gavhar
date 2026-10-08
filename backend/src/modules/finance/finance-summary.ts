import { Money, ZERO, moneyString } from '@/common/utils/money.util';
import { eachDay, eachMonth } from '@/common/utils/app-date.util';
import { SummaryGroup } from './dto/finance.dto';

/** Bir kunga tegishli summa. */
export interface DatedAmount {
  /** `YYYY-MM-DD`. */
  day: string;
  amount: Money;
}

export interface SeriesPoint {
  /** Kun (`YYYY-MM-DD`) yoki oy (`YYYY-MM`). */
  key: string;
  income: string;
  expense: string;
  profit: string;
}

export const sumAmounts = (rows: readonly DatedAmount[]): Money =>
  rows.reduce((sum, row) => sum.add(row.amount), ZERO);

/**
 * Grafik uchun qator: davrning har bir kuni (yoki oyi) bo'yicha tushum va xarajat.
 * Ma'lumot bo'lmagan kunlar ham nol bilan qaytadi — grafikda bo'shliq qolmaydi.
 */
export function buildSeries(
  from: string,
  to: string,
  groupBy: SummaryGroup,
  incomes: readonly DatedAmount[],
  expenses: readonly DatedAmount[],
): SeriesPoint[] {
  const keyOf = (day: string) => (groupBy === 'month' ? day.slice(0, 7) : day);
  const collect = (rows: readonly DatedAmount[]) => {
    const totals = new Map<string, Money>();
    for (const row of rows) {
      const key = keyOf(row.day);
      totals.set(key, (totals.get(key) ?? ZERO).add(row.amount));
    }
    return totals;
  };
  const income = collect(incomes);
  const expense = collect(expenses);

  return (groupBy === 'month' ? eachMonth(from, to) : eachDay(from, to)).map((key) => {
    const earned = income.get(key) ?? ZERO;
    const spent = expense.get(key) ?? ZERO;
    return {
      key,
      income: moneyString(earned),
      expense: moneyString(spent),
      profit: moneyString(earned.sub(spent)),
    };
  });
}
