/**
 * Ilova vaqt zonasidagi (Asia/Tashkent) kalendar sanalari bilan ishlash.
 * Sana har doim `YYYY-MM-DD` satri ko'rinishida yuradi — vaqt zonasi xatosi bo'lmasligi uchun.
 */
const DAY_MS = 86_400_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const utcOf = (date: string): number => Date.parse(`${date}T00:00:00.000Z`);
const toDateString = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Mavjud kalendar sanasimi (2026-02-30 kabi qiymatlar rad etiladi). */
export const isValidDate = (date: string): boolean =>
  DATE_PATTERN.test(date) && !Number.isNaN(utcOf(date)) && toDateString(utcOf(date)) === date;

/** Berilgan lahzaning shu vaqt zonasidagi sanasi. */
export const localDate = (instant: Date, timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);

/** Vaqt zonasining shu lahzadagi UTC'dan farqi, millisekundda. */
const zoneOffset = (instant: number, timeZone: string): number => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour'),
    value('minute'),
    value('second'),
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
};

/** Shu vaqt zonasida kun boshlanadigan lahza (mahalliy 00:00). */
export const startOfLocalDay = (date: string, timeZone: string): Date => {
  const guess = utcOf(date);
  const first = guess - zoneOffset(guess, timeZone);
  // Yozgi vaqtga o'tadigan zonalarda farq o'zgarishi mumkin — bir marta aniqlashtiriladi.
  return new Date(guess - zoneOffset(first, timeZone));
};

export const addDays = (date: string, days: number): string =>
  toDateString(utcOf(date) + days * DAY_MS);

/** Ikki sana orasidagi kunlar soni (`to − from`). */
export const diffDays = (from: string, to: string): number =>
  Math.round((utcOf(to) - utcOf(from)) / DAY_MS);

/** `from` dan `to` gacha (ikkalasi ham kiradi) barcha sanalar. */
export const eachDay = (from: string, to: string): string[] =>
  Array.from({ length: Math.max(0, diffDays(from, to) + 1) }, (_, index) => addDays(from, index));

/** Oraliqqa tushadigan oylar: `YYYY-MM`. */
export const eachMonth = (from: string, to: string): string[] => {
  const months: string[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const last = to.slice(0, 7);
  for (;;) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (key > last) return months;
    months.push(key);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
};

/** `@db.Date` ustuni uchun qiymat (UTC yarim tun). */
export const toDbDate = (date: string): Date => new Date(utcOf(date));

/** `@db.Date` ustunidan o'qilgan qiymat → `YYYY-MM-DD`. */
export const fromDbDate = (value: Date): string => value.toISOString().slice(0, 10);
