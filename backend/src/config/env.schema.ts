import { z } from 'zod';

const booleanString = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((value) => value === 'true');

const secret = (name: string) =>
  z.string().min(32, `${name} kamida 32 belgidan iborat bo'lishi kerak`);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    TZ: z.string().min(1).default('Asia/Tashkent'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    API_PORT: z.coerce.number().int().min(1).max(65535).default(4100),
    APP_URL: z.string().url(),
    SWAGGER_ENABLED: booleanString('false'),

    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\/.+/, "PostgreSQL URL bo'lishi kerak"),
    REDIS_URL: z.string().regex(/^rediss?:\/\/.+/, "Redis URL bo'lishi kerak"),

    JWT_ACCESS_SECRET: secret('JWT_ACCESS_SECRET'),
    JWT_ACCESS_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
    PASSWORD_PEPPER: secret('PASSWORD_PEPPER'),
    ENCRYPTION_KEY: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/, "ENCRYPTION_KEY 64 ta hex belgi (32 bayt) bo'lishi kerak"),
    COOKIE_SECURE: booleanString('true'),
    /** SUPER_ADMIN uchun ikki bosqichli himoya majburiymi. Productionda `true` tavsiya etiladi. */
    SUPER_ADMIN_2FA_REQUIRED: booleanString('true'),

    S3_ENDPOINT: z.string().url(),
    S3_PUBLIC_ENDPOINT: z.string().url(),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_ACCESS_KEY: z.string().min(3),
    S3_SECRET_KEY: z.string().min(8),
    S3_BUCKET_ORIGINALS: z.string().min(3),
    S3_BUCKET_DERIVATIVES: z.string().min(3),
    S3_FORCE_PATH_STYLE: booleanString('true'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;

    if (!env.COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: "production'da true bo'lishi shart",
      });
    }
    if (!env.APP_URL.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['APP_URL'],
        message: "production'da https bo'lishi shart",
      });
    }
    if (env.JWT_ACCESS_SECRET === env.PASSWORD_PEPPER) {
      ctx.addIssue({
        code: 'custom',
        path: ['PASSWORD_PEPPER'],
        message: "JWT_ACCESS_SECRET bilan bir xil bo'lmasligi kerak",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Xato xabarida faqat o'zgaruvchi nomi va sabab chiqadi — qiymatlar (sirlar)
 * hech qachon logga tushmaydi.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (result.success) return result.data;

  const lines = result.error.issues.map(
    (issue) => `  - ${issue.path.join('.') || '(env)'}: ${issue.message}`,
  );
  throw new Error(`Muhit o'zgaruvchilari noto'g'ri:\n${lines.join('\n')}`);
}
