import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { UsersService } from '@/modules/users/users.service';

const USAGE = `Foydalanish: pnpm user:reset-password <email> [--reset-2fa]

Parolini unutgan foydalanuvchiga (jumladan yagona SUPER_ADMIN'ga) yangi vaqtinchalik
parol o'rnatadi. Faqat serverga kirish huquqi bor odam ishlata oladi.
  --reset-2fa   ikki bosqichli himoyani ham o'chiradi (telefon yo'qolgan bo'lsa)`;

const write = (line = '') => process.stdout.write(`${line}\n`);

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const email = args.find((arg) => !arg.startsWith('--'));
  const unknown = args.filter((arg) => arg.startsWith('--') && arg !== '--reset-2fa');
  if (!email || unknown.length > 0) {
    write(USAGE);
    process.exitCode = 1;
    return;
  }

  // Ilovaning o'z servislari ishlatiladi: parol xuddi interfeysdagidek xeshlanadi,
  // eski sessiyalar yopiladi, blok olib tashlanadi va amal audit jurnaliga yoziladi.
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const result = await app.get(UsersService).recoverAccess(email, {
      resetTwoFactor: args.includes('--reset-2fa'),
    });

    write();
    write(`  Foydalanuvchi:      ${result.fullName} (${result.role})`);
    write(`  Login (email):      ${result.email}`);
    write(`  Vaqtinchalik parol: ${result.temporaryPassword}`);
    if (result.twoFactorReset) write("  Ikki bosqichli himoya o'chirildi — qayta ulash kerak.");
    write();
    write('  Birinchi kirishda parolni almashtirish so‘raladi. Eski sessiyalar yopildi.');
    write('  Bu parol boshqa ko‘rsatilmaydi.');
    write();
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Xato: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
