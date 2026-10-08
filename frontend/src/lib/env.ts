import { z } from 'zod';

const envSchema = z.object({
  // Nisbiy yo'l (`/api/v1`) yoki to'liq URL (`https://api.gavhar.uz/api/v1`).
  VITE_API_URL: z
    .string()
    .regex(/^(\/|https?:\/\/)/, "VITE_API_URL '/' yoki 'http(s)://' bilan boshlanishi kerak")
    .default('/api/v1'),
});

const parsed = envSchema.safeParse(import.meta.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Frontend muhit o'zgaruvchilari noto'g'ri — ${details}`);
}

export const env = {
  apiUrl: parsed.data.VITE_API_URL.replace(/\/+$/, ''),
  isDev: import.meta.env.DEV,
} as const;
