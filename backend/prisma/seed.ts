import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { bootstrapAccessControl } from './seed/bootstrap';
import { seedDemoContent, seedExpenseCategories } from './seed/demo-content';

const seedEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PASSWORD_PEPPER: z.string().min(32),
  SEED_SUPER_ADMIN_EMAIL: z.string().email(),
  SEED_SUPER_ADMIN_NAME: z.string().min(2).default('Super Admin'),
  SEED_SUPER_ADMIN_PASSWORD: z.string().min(1),
});

const write = (line: string) => process.stdout.write(`${line}\n`);

async function main(): Promise<void> {
  const parsed = seedEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Seed uchun muhit o'zgaruvchilari noto'g'ri: ${names}`);
  }
  const env = parsed.data;

  const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  try {
    const result = await bootstrapAccessControl(
      prisma,
      {
        email: env.SEED_SUPER_ADMIN_EMAIL,
        fullName: env.SEED_SUPER_ADMIN_NAME,
        password: env.SEED_SUPER_ADMIN_PASSWORD,
      },
      env.PASSWORD_PEPPER,
    );

    write(`Ruxsatlar sinxronlandi: ${result.permissions} ta`);
    write(
      result.superAdminCreated
        ? `SUPER_ADMIN yaratildi: ${env.SEED_SUPER_ADMIN_EMAIL} (birinchi kirishda parol almashtiriladi)`
        : 'SUPER_ADMIN allaqachon mavjud — yangisi yaratilmadi',
    );

    const demo = await seedDemoContent(prisma);
    write(
      demo.menuCreated
        ? 'Menyu: 11 ta bo‘lim va 3 ta paket (Standart, Premium, VIP) yaratildi'
        : 'Menyu allaqachon mavjud — o‘zgartirilmadi',
    );
    write(
      demo.albumsCreated
        ? 'Galereya: 5 ta albom yaratildi'
        : 'Galereya albomlari allaqachon mavjud — o‘zgartirilmadi',
    );
    const addedCategories = await seedExpenseCategories(prisma);
    write(
      addedCategories > 0
        ? `Xarajat turlari: ${addedCategories} ta qo‘shildi`
        : 'Xarajat turlari allaqachon mavjud — o‘zgartirilmadi',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
