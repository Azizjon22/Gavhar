import { randomInt } from 'node:crypto';

// Og'zaki aytganda yoki qog'ozdan ko'chirganda adashtiradigan belgilar (0/O, 1/l/I) olib tashlangan.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SPECIAL = '!@#$%&*?';

const pick = (alphabet: string): string => alphabet.charAt(randomInt(alphabet.length));

/**
 * Parol siyosatiga mos vaqtinchalik parol (kriptografik tasodifiy).
 * Har bir turdan kamida bitta belgi bo'ladi, tartibi aralashtiriladi.
 */
export function generateTemporaryPassword(length = 16): string {
  const all = UPPER + LOWER + DIGITS + SPECIAL;
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SPECIAL)];
  while (chars.length < length) chars.push(pick(all));

  // Fisher–Yates: majburiy belgilar har doim boshida turmasin.
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const other = randomInt(index + 1);
    [chars[index], chars[other]] = [chars[other] as string, chars[index] as string];
  }
  return chars.join('');
}
