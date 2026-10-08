import * as argon2 from 'argon2';

/** OWASP tavsiyasidan yuqori: 64 MiB xotira, 3 iteratsiya. */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 1,
} as const;

/**
 * argon2id + pepper. Pepper argon2'ning `secret` parametri sifatida beriladi:
 * u hash ichida saqlanmaydi, shuning uchun baza o'g'irlansa ham pepper'siz
 * parollarni tiklab bo'lmaydi.
 */
export const hashPassword = (password: string, pepper: string): Promise<string> =>
  argon2.hash(password, { ...ARGON2_OPTIONS, secret: Buffer.from(pepper) });

export const verifyPassword = async (
  hash: string,
  password: string,
  pepper: string,
): Promise<boolean> => {
  try {
    return await argon2.verify(hash, password, { secret: Buffer.from(pepper) });
  } catch {
    // Buzilgan yoki boshqa formatdagi hash — parol mos emas deb hisoblanadi.
    return false;
  }
};

export const passwordNeedsRehash = (hash: string): boolean =>
  argon2.needsRehash(hash, ARGON2_OPTIONS);
