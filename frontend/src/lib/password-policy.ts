export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** Backend'dagi `password-policy.ts` bilan bir xil qoidalar. */
export const PASSWORD_RULES = [
  { key: 'length', test: (value: string) => value.length >= PASSWORD_MIN_LENGTH },
  { key: 'upper', test: (value: string) => /\p{Lu}/u.test(value) },
  { key: 'lower', test: (value: string) => /\p{Ll}/u.test(value) },
  { key: 'digit', test: (value: string) => /\d/.test(value) },
  { key: 'special', test: (value: string) => /[^\p{L}\p{N}\s]/u.test(value) },
] as const;

export type PasswordRuleKey = (typeof PASSWORD_RULES)[number]['key'];

export const isStrongPassword = (value: string): boolean =>
  value.length <= PASSWORD_MAX_LENGTH && PASSWORD_RULES.every((rule) => rule.test(value));

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SPECIAL = '!@#$%&*?-_';

/** Kriptografik tasodifiy indeks (modul og'ishisiz). */
function randomIndex(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buffer = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0] ?? 0;
  } while (value >= limit);
  return value % max;
}

const pick = (alphabet: string): string => alphabet.charAt(randomIndex(alphabet.length));

/**
 * Siyosatga mos vaqtinchalik parol. O'xshash belgilar (0/O, 1/l/I) ishlatilmaydi —
 * xodimga og'zaki yoki qog'ozda yetkazish oson bo'lishi uchun.
 */
export function generatePassword(length = 16): string {
  const all = UPPER + LOWER + DIGITS + SPECIAL;
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SPECIAL)];
  while (chars.length < length) chars.push(pick(all));

  // Fisher–Yates: majburiy belgilar har doim boshida turmasin.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    const current = chars[i] as string;
    chars[i] = chars[j] as string;
    chars[j] = current;
  }
  return chars.join('');
}
