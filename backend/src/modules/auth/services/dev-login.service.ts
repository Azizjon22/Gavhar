import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SessionRevokeReason, UserStatus } from '@prisma/client';
import { PasswordService } from '@/common/crypto/password.service';
import { randomToken } from '@/common/crypto/token.util';
import { AppException } from '@/common/errors/app.exception';
import { SYSTEM_ROLES } from '@/common/permissions/permission-catalog';
import { AppConfigService } from '@/config/app-config.service';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { DEV_LOGIN_EMAIL_DOMAIN } from '../auth.constants';
import { AuthService, AuthTokens } from '../auth.service';
import { AuthContextService } from './auth-context.service';
import { SessionsService } from './sessions.service';

/** Tezkor kirish ro'yxatida tizim rollari shu tartibda, qolganlari — nomi bo'yicha. */
const ROLE_ORDER: string[] = [
  SYSTEM_ROLES.SUPER_ADMIN,
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.ZAVZAL,
  SYSTEM_ROLES.COOK,
];
const rank = (key: string): number => {
  const index = ROLE_ORDER.indexOf(key);
  return index === -1 ? ROLE_ORDER.length : index;
};

/**
 * Ishlab chiqish paytida parolsiz kirish: tanlangan rol uchun alohida sinov hisobi
 * ochiladi va darhol sessiya beriladi (parol, 2FA va majburiy parol almashtirishsiz).
 *
 * Faqat `DEV_LOGIN_ENABLED=true` va production bo'lmagan muhitda ishlaydi —
 * production'da bu sozlama bilan server ishga tushmaydi (`env.schema.ts`).
 * Haqiqiy hisoblarga tegilmaydi; rejim o'chirilgach sinov hisoblari yopiladi.
 */
@Injectable()
export class DevLoginService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DevLoginService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly auth: AuthService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionsService,
    private readonly authContext: AuthContextService,
  ) {}

  get enabled(): boolean {
    return this.config.auth.devLoginEnabled;
  }

  async onApplicationBootstrap(): Promise<void> {
    if (this.enabled) {
      this.logger.warn(
        'DEV_LOGIN_ENABLED=true — PAROLSIZ KIRISH YOQILGAN. Faqat ishlab chiqish uchun; ' +
          "ishni tugatgach .env'da false qiling.",
      );
      return;
    }
    try {
      await this.closeDevAccounts();
    } catch (error) {
      this.logger.error({ err: error }, "Sinov hisoblarini yopib bo'lmadi");
    }
  }

  async options() {
    if (!this.enabled) return { enabled: false, roles: [] };
    const roles = await this.prisma.role.findMany({ select: { id: true, key: true, name: true } });
    return {
      enabled: true,
      roles: roles.sort((a, b) => rank(a.key) - rank(b.key) || a.name.localeCompare(b.name, 'uz')),
    };
  }

  async login(roleId: string): Promise<AuthTokens> {
    if (!this.enabled) {
      throw AppException.notFound('DEV_LOGIN_DISABLED', "Tezkor kirish o'chirilgan");
    }
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw AppException.notFound('ROLE_NOT_FOUND', 'Rol topilmadi');

    const email = `dev-${role.id}@${DEV_LOGIN_EMAIL_DOMAIN}`;
    const account = {
      fullName: `${role.name} sinov`,
      roleId: role.id,
      status: UserStatus.ACTIVE,
      deletedAt: null,
      mustChangePassword: false,
      twoFactorEnabled: false,
      totpSecretEnc: null,
    };
    const user = await this.prisma.user.upsert({
      where: { email },
      update: account,
      // Parol tasodifiy va hech kimga ma'lum emas — bu hisobga oddiy yo'l bilan kirib bo'lmaydi.
      create: { ...account, email, passwordHash: await this.passwords.hash(randomToken(48)) },
    });
    return this.auth.completeLogin(user.id, email, 'auth.dev_login');
  }

  /** Rejim o'chirilgan: sinov hisoblari bloklanadi, sessiyalari bekor qilinadi. */
  private async closeDevAccounts(): Promise<void> {
    const accounts = await this.prisma.user.findMany({
      where: { email: { endsWith: `@${DEV_LOGIN_EMAIL_DOMAIN}` }, deletedAt: null },
      select: { id: true },
    });
    if (accounts.length === 0) return;

    const ids = accounts.map((account) => account.id);
    await this.prisma.user.updateMany({
      where: { id: { in: ids } },
      data: { status: UserStatus.BLOCKED, deletedAt: new Date() },
    });
    for (const id of ids) {
      await this.sessions.revokeAllForUser(id, SessionRevokeReason.USER_BLOCKED);
    }
    await this.authContext.invalidate(...ids);
    this.logger.log(`Tezkor kirish o'chirilgan: ${ids.length} ta sinov hisobi yopildi`);
  }
}
