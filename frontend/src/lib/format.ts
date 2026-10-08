import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/uz-latn';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import isoWeek from 'dayjs/plugin/isoWeek';
import relativeTime from 'dayjs/plugin/relativeTime';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import type { Language } from '@/stores/locale.store';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);
dayjs.extend(isoWeek);
dayjs.extend(customParseFormat);

/** Qurilma qayerda bo'lishidan qat'i nazar vaqt Toshkent bo'yicha ko'rsatiladi. */
export const APP_TIMEZONE = 'Asia/Tashkent';
dayjs.tz.setDefault(APP_TIMEZONE);

const DAYJS_LOCALE: Record<Language, string> = { uz: 'uz-latn', ru: 'ru' };
const EMPTY = '—';

export const setDateLocale = (language: Language): void => {
  dayjs.locale(DAYJS_LOCALE[language]);
};

type DateInput = string | Date | null | undefined;

export const formatDateTime = (value: DateInput): string =>
  value ? dayjs(value).tz(APP_TIMEZONE).format('DD.MM.YYYY HH:mm') : EMPTY;

export const formatDate = (value: DateInput): string =>
  value ? dayjs(value).tz(APP_TIMEZONE).format('DD.MM.YYYY') : EMPTY;

/** "3 daqiqa oldin", "2 kun oldin". */
export const formatRelative = (value: DateInput): string =>
  value ? dayjs(value).fromNow() : EMPTY;

/** `<input type="date">` qiymatini (Toshkent kuni) UTC ISO oralig'iga aylantiradi. */
export const dayStartIso = (date: string): string =>
  dayjs.tz(date, APP_TIMEZONE).startOf('day').toISOString();

export const dayEndIso = (date: string): string =>
  dayjs.tz(date, APP_TIMEZONE).endOf('day').toISOString();

export const formatTime = (value: DateInput): string =>
  value ? dayjs(value).tz(APP_TIMEZONE).format('HH:mm') : EMPTY;

/** Toshkent vaqtidagi `dayjs` obyekti — kalendar hisob-kitoblari uchun. */
export const inAppZone = (value?: string | Date) => dayjs(value).tz(APP_TIMEZONE);

/** "2026-11-05" + "18:00" (Toshkent) → UTC ISO. */
export const zonedIso = (date: string, time: string): string =>
  dayjs.tz(`${date} ${time}`, 'YYYY-MM-DD HH:mm', APP_TIMEZONE).toISOString();
