import { hashPassword, passwordNeedsRehash, verifyPassword } from './password.util';

const PEPPER = 'p'.repeat(48);
const PASSWORD = 'Togri!Parol2026aA';

describe('password.util', () => {
  let hash: string;

  beforeAll(async () => {
    hash = await hashPassword(PASSWORD, PEPPER);
  });

  it('argon2id, 64 MiB xotira va 3 iteratsiya bilan hashlaydi', () => {
    expect(hash).toMatch(/^\$argon2id\$v=19\$/);
    expect(hash).toContain('m=65536');
    expect(hash).toContain('t=3');
    expect(hash).not.toContain(PASSWORD);
    expect(passwordNeedsRehash(hash)).toBe(false);
  });

  it('bir xil parol har safar boshqa hash beradi (tasodifiy salt)', async () => {
    await expect(hashPassword(PASSWORD, PEPPER)).resolves.not.toBe(hash);
  });

  it("to'g'ri parolni tasdiqlaydi, noto'g'risini rad etadi", async () => {
    await expect(verifyPassword(hash, PASSWORD, PEPPER)).resolves.toBe(true);
    await expect(verifyPassword(hash, `${PASSWORD}x`, PEPPER)).resolves.toBe(false);
  });

  it("pepper'siz yoki boshqa pepper bilan hash yaroqsiz", async () => {
    await expect(verifyPassword(hash, PASSWORD, 'x'.repeat(48))).resolves.toBe(false);
  });

  it('buzilgan hash xato tashlamaydi, shunchaki mos kelmaydi', async () => {
    await expect(verifyPassword('hash-emas', PASSWORD, PEPPER)).resolves.toBe(false);
  });
});
