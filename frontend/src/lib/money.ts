const GROUP_SEPARATOR = ' ';

/**
 * Pul summasini o'qishga qulay ko'rinishga keltiradi: "15000000.00" → "15 000 000".
 * Satr ustida ishlaydi — katta summalarda `Number` aniqligiga bog'liq emas.
 */
export function formatAmount(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';

  const [integer = '0', fraction = ''] = String(value).split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR);
  const cents = fraction.replace(/0+$/, '');
  return cents ? `${grouped}.${cents.padEnd(2, '0')}` : grouped;
}

/** Kiritilgan matndan faqat raqamlarni qoldiradi ("15 000 000 so'm" → "15000000"). */
export const parseAmountInput = (input: string, maxDigits = 13): string =>
  input
    .replace(/\D/g, '')
    .replace(/^0+(?=\d)/, '')
    .slice(0, maxDigits);

/** API'dan kelgan "15000000.00" ni forma qiymatiga ("15000000") aylantiradi. */
export const amountToInput = (value: string): string => value.split('.')[0] ?? '';
