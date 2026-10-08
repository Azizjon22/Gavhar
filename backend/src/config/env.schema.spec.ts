import { validateEnv } from './env.schema';

const validEnv = {
  NODE_ENV: 'development',
  APP_URL: 'http://localhost:5180',
  DATABASE_URL: 'postgresql://gavhar:pw@localhost:5440/gavhar?schema=public',
  REDIS_URL: 'redis://:pw@localhost:6380/0',
  JWT_ACCESS_SECRET: 'a'.repeat(48),
  PASSWORD_PEPPER: 'b'.repeat(48),
  ENCRYPTION_KEY: 'c'.repeat(64),
  COOKIE_SECURE: 'false',
  S3_ENDPOINT: 'http://localhost:9010',
  S3_PUBLIC_ENDPOINT: 'http://localhost:9010',
  S3_ACCESS_KEY: 'gavhar',
  S3_SECRET_KEY: 'super-secret-key',
  S3_BUCKET_ORIGINALS: 'gavhar-originals',
  S3_BUCKET_DERIVATIVES: 'gavhar-derivatives',
};

describe('validateEnv', () => {
  it("to'g'ri muhitni qabul qiladi va standart qiymatlarni qo'yadi", () => {
    const env = validateEnv(validEnv);

    expect(env.API_PORT).toBe(4100);
    expect(env.JWT_ACCESS_TTL_MINUTES).toBe(15);
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(7);
    expect(env.TZ).toBe('Asia/Tashkent');
    expect(env.COOKIE_SECURE).toBe(false);
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
  });

  it('satr ko‘rinishidagi sonlarni songa aylantiradi', () => {
    expect(validateEnv({ ...validEnv, API_PORT: '5000' }).API_PORT).toBe(5000);
  });

  it('qisqa sirni rad etadi va qiymatni xabarga chiqarmaydi', () => {
    const act = () => validateEnv({ ...validEnv, JWT_ACCESS_SECRET: 'qisqa-sir' });

    expect(act).toThrow(/JWT_ACCESS_SECRET/);
    expect(act).not.toThrow(/qisqa-sir/);
  });

  it("noto'g'ri ENCRYPTION_KEY ni rad etadi", () => {
    expect(() => validateEnv({ ...validEnv, ENCRYPTION_KEY: 'zz' })).toThrow(/ENCRYPTION_KEY/);
  });

  it("yetishmayotgan majburiy o'zgaruvchilarni sanab beradi", () => {
    const { DATABASE_URL: _db, REDIS_URL: _redis, ...rest } = validEnv;

    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL[\s\S]*REDIS_URL/);
  });

  describe('production', () => {
    const prodEnv = {
      ...validEnv,
      NODE_ENV: 'production',
      APP_URL: 'https://admin.gavhar.uz',
      COOKIE_SECURE: 'true',
    };

    it('xavfsiz sozlamalarni qabul qiladi', () => {
      expect(validateEnv(prodEnv).NODE_ENV).toBe('production');
    });

    it('COOKIE_SECURE=false ni rad etadi', () => {
      expect(() => validateEnv({ ...prodEnv, COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/);
    });

    it('http APP_URL ni rad etadi', () => {
      expect(() => validateEnv({ ...prodEnv, APP_URL: 'http://admin.gavhar.uz' })).toThrow(
        /APP_URL/,
      );
    });

    it('pepper va JWT siri bir xil bo‘lsa rad etadi', () => {
      expect(() => validateEnv({ ...prodEnv, PASSWORD_PEPPER: prodEnv.JWT_ACCESS_SECRET })).toThrow(
        /PASSWORD_PEPPER/,
      );
    });
  });
});
