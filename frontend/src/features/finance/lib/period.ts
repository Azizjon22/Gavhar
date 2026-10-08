import dayjs from 'dayjs';
import { inAppZone } from '@/lib/format';

export const PERIODS = ['week', 'month', 'year'] as const;
export type Period = (typeof PERIODS)[number];

const FORMAT = 'YYYY-MM-DD';
const UNIT = { week: 'isoWeek', month: 'month', year: 'year' } as const;

export interface PeriodRange {
  from: string;
  to: string;
  /** Yil — oylar bo'yicha, hafta va oy — kunlar bo'yicha ko'rsatiladi. */
  groupBy: 'day' | 'month';
}

/** Toshkent vaqti bo'yicha bugungi sana. */
export const todayDate = (): string => inAppZone().format(FORMAT);

/** Berilgan kun tushadigan hafta (dushanba–yakshanba), oy yoki yil. */
export const periodRange = (period: Period, anchor: string): PeriodRange => {
  const date = dayjs(anchor, FORMAT);
  return {
    from: date.startOf(UNIT[period]).format(FORMAT),
    to: date.endOf(UNIT[period]).format(FORMAT),
    groupBy: period === 'year' ? 'month' : 'day',
  };
};

/** Oldingi (`-1`) yoki keyingi (`+1`) davrdagi tayanch kun. */
export const shiftPeriod = (period: Period, anchor: string, step: -1 | 1): string =>
  dayjs(anchor, FORMAT).startOf(UNIT[period]).add(step, period).format(FORMAT);

/** Keyingi davr butunlay kelajakda bo'lsa, unga o'tishning ma'nosi yo'q. */
export const canGoForward = (period: Period, anchor: string, today: string): boolean =>
  periodRange(period, shiftPeriod(period, anchor, 1)).from <= today;

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "5 – 11 okt 2026", "Oktabr 2026", "2026". */
export const periodLabel = (period: Period, anchor: string): string => {
  const { from, to } = periodRange(period, anchor);
  if (period === 'year') return from.slice(0, 4);
  if (period === 'month') return capitalize(dayjs(from, FORMAT).format('MMMM YYYY'));

  const start = dayjs(from, FORMAT);
  const end = dayjs(to, FORMAT);
  return start.month() === end.month()
    ? `${start.format('D')} – ${end.format('D MMM YYYY')}`
    : `${start.format('D MMM')} – ${end.format('D MMM YYYY')}`;
};

/** Grafik ostidagi qisqa yozuv: hafta kuni, oy kuni yoki oy nomi. */
export const bucketLabel = (period: Period, key: string): string => {
  if (period === 'year') return capitalize(dayjs(`${key}-01`, FORMAT).format('MMM'));
  const date = dayjs(key, FORMAT);
  return period === 'week' ? capitalize(date.format('dd')) : date.format('D');
};

/** Maslahat oynasidagi to'liq yozuv: "7 oktabr, chorshanba" yoki "Oktabr 2026". */
export const bucketTitle = (period: Period, key: string): string =>
  period === 'year'
    ? capitalize(dayjs(`${key}-01`, FORMAT).format('MMMM YYYY'))
    : dayjs(key, FORMAT).format('D MMMM, dddd');
