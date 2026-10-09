export const PHONE_PREFIX = '+998';
export const UZ_PHONE = /^\+998\d{9}$/;
const LOCAL_LENGTH = 9;

/** "+998901234567" → "+998 90 123 45 67". Boshqa formatdagi qiymat o'zgarishsiz qaytadi. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  if (!UZ_PHONE.test(phone)) return phone;
  return `${PHONE_PREFIX} ${formatLocalPhone(phone.slice(PHONE_PREFIX.length))}`;
}

/** Mamlakat kodisiz 9 raqam: "901234567" → "90 123 45 67" (to'liq bo'lmasa ham). */
export function formatLocalPhone(digits: string): string {
  return [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)]
    .filter(Boolean)
    .join(' ');
}

/**
 * Foydalanuvchi yozgan yoki qo'ygan (paste) matndan mahalliy 9 raqamni ajratadi.
 * "+998 90 123-45-67", "998901234567" va "90 123 45 67" — hammasi "901234567".
 */
export function extractLocalPhone(input: string): string {
  let digits = input.replace(/\D/g, '');
  // «+998…» — kod allaqachon yozilgan (qisman ham). Uzunlikka qarab kesish yetarli emas:
  // «+9989» 9 tadan qisqa, shuning uchun 998 qayta mahalliy raqamga qo'shilib ketardi.
  const hasCountryCode = input.trimStart().startsWith('+') || digits.length > LOCAL_LENGTH;
  if (hasCountryCode && digits.startsWith('998')) digits = digits.slice(3);
  return digits.slice(0, LOCAL_LENGTH);
}

/** Forma qiymati: bo'sh yoki "+998" + kiritilgan raqamlar. */
export const toPhoneValue = (localDigits: string): string =>
  localDigits ? `${PHONE_PREFIX}${localDigits}` : '';
