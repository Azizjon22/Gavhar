/**
 * E2E testlar haqiqiy PostgreSQL, Redis va MinIO'da, lekin alohida joyda
 * (`gavhar_test` bazasi, Redis DB 1, `*-test` bucket'lar) ishlaydi —
 * dev ma'lumotlariga tegmaydi.
 */
export function applyTestEnv(): void {
  const { DATABASE_URL, REDIS_URL } = process.env;
  if (!DATABASE_URL || !REDIS_URL) {
    throw new Error('E2E testlar uchun .env kerak: `pnpm test:e2e` orqali ishga tushiring');
  }

  const database = new URL(DATABASE_URL);
  database.pathname = '/gavhar_test';
  const redis = new URL(REDIS_URL);
  redis.pathname = '/1';

  Object.assign(process.env, {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    SWAGGER_ENABLED: 'false',
    COOKIE_SECURE: 'false',
    SUPER_ADMIN_2FA_REQUIRED: 'true',
    DATABASE_URL: database.toString(),
    REDIS_URL: redis.toString(),
    S3_BUCKET_ORIGINALS: 'gavhar-originals-test',
    S3_BUCKET_DERIVATIVES: 'gavhar-derivatives-test',
  });
}
