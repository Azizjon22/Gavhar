import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { SessionRevokeReason } from '@prisma/client';
import { Redis } from 'ioredis';
import { authenticator } from 'otplib';
import { toDataURL } from 'qrcode';
import { EncryptionService } from '@/common/crypto/encryption.service';
import { PasswordService } from '@/common/crypto/password.service';
import { hmacSha256Hex } from '@/common/crypto/token.util';
import { AppException } from '@/common/errors/app.exception';
import { SYSTEM_ROLES } from '@/common/permissions/permission-catalog';
import { AuthUser } from '@/common/types/auth-user';
import { AppConfigService } from '@/config/app-config.service';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { REDIS_CLIENT } from '@/infrastructure/redis/redis.constants';
import { AuditService } from '@/modules/audit/audit.service';
import { BACKUP_CODE_COUNT, TOTP_REPLAY_TTL_SECONDS, redisKeys } from '../auth.constants';
import { AuthContextService } from './auth-context.service';
import { SessionsService } from './sessions.service';

const TOTP_ISSUER = 'Gavhar';
const TOTP_SECRET_BYTES = 20;
const TOTP_CODE = /^\d{6}$/;
// O'xshash belgilarsiz (0/O, 1/I/L) — qog'ozdan o'qish oson bo'lishi uchun.
const BACKUP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const BACKUP_CODE_LENGTH = 10;

// Soat farqi uchun ±1 qadam (30 soniya) ruxsat.
const totp = authenticator.clone({ window: 1 });

const invalidCode = () => AppException.badRequest('INVALID_2FA_CODE', "Tasdiqlash kodi noto'g'ri");

const generateBackupCode = (): string => {
  let code = '';
  while (code.length < BACKUP_CODE_LENGTH) {
    for (const byte of randomBytes(BACKUP_CODE_LENGTH)) {
      // Rad etish usuli: taqsimot bir tekis bo'lishi uchun.
      if (byte < BACKUP_ALPHABET.length * 8 && code.length < BACKUP_CODE_LENGTH) {
        code += BACKUP_ALPHABET[byte % BACKUP_ALPHABET.length];
      }
    }
  }
  return `${code.slice(0, 5)}-${code.slice(5)}`;
};

const normalizeBackupCode = (code: string): string => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

@Injectable()
export class TwoFactorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly encryption: EncryptionService,
    private readonly passwords: PasswordService,
    private readonly authContext: AuthContextService,
    private readonly sessions: SessionsService,
    private readonly audit: AuditService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** 1-qadam: sir yaratiladi, lekin kod bilan tasdiqlanmaguncha 2FA yoqilmaydi. */
  async beginSetup(user: AuthUser) {
    if (user.twoFactorEnabled) {
      throw AppException.conflict('TWO_FACTOR_ALREADY_ENABLED', '2FA allaqachon yoqilgan');
    }

    const secret = totp.generateSecret(TOTP_SECRET_BYTES);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { totpSecretEnc: this.encryption.encrypt(secret) },
    });

    const otpauthUrl = totp.keyuri(user.email, TOTP_ISSUER, secret);
    return {
      secret,
      otpauthUrl,
      qrCodeDataUrl: await toDataURL(otpauthUrl, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 280,
      }),
    };
  }

  /** 2-qadam: kod tasdiqlansa 2FA yoqiladi va zaxira kodlar bir marta ko'rsatiladi. */
  async enable(user: AuthUser, code: string) {
    if (user.twoFactorEnabled) {
      throw AppException.conflict('TWO_FACTOR_ALREADY_ENABLED', '2FA allaqachon yoqilgan');
    }
    const record = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { totpSecretEnc: true },
    });
    if (!record.totpSecretEnc) {
      throw AppException.badRequest('TWO_FACTOR_SETUP_NOT_STARTED', 'Avval 2FA sozlashni boshlang');
    }
    if (!(await this.verifyTotp(user.id, record.totpSecretEnc, code))) {
      throw invalidCode();
    }

    const backupCodes = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
      const codes = await this.replaceBackupCodes(tx, user.id);
      await this.audit.log(
        { action: 'auth.2fa_enabled', resource: 'user', resourceId: user.id },
        tx,
      );
      return codes;
    });

    await this.authContext.invalidate(user.id);
    // Boshqa qurilmalardagi eski (2FA'siz ochilgan) sessiyalar yopiladi.
    await this.sessions.revokeAllForUser(
      user.id,
      SessionRevokeReason.SECURITY_CHANGE,
      user.sessionId,
    );
    return { backupCodes };
  }

  async disable(user: AuthUser, password: string, code: string): Promise<void> {
    if (this.config.auth.superAdminTwoFactorRequired && user.roleKey === SYSTEM_ROLES.SUPER_ADMIN) {
      throw AppException.forbidden(
        'TWO_FACTOR_REQUIRED_FOR_ROLE',
        "SUPER_ADMIN uchun 2FA majburiy, o'chirib bo'lmaydi",
      );
    }
    const record = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { passwordHash: true, totpSecretEnc: true, twoFactorEnabled: true },
    });
    if (!record.twoFactorEnabled || !record.totpSecretEnc) {
      throw AppException.badRequest('TWO_FACTOR_NOT_ENABLED', '2FA yoqilmagan');
    }
    if (!(await this.passwords.verify(record.passwordHash, password))) {
      throw AppException.badRequest('INVALID_PASSWORD', "Parol noto'g'ri");
    }
    if (!(await this.verifyLoginCode(user.id, code))) {
      throw invalidCode();
    }

    await this.clear(user.id, 'auth.2fa_disabled');
  }

  async regenerateBackupCodes(user: AuthUser, code: string) {
    const record = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { totpSecretEnc: true, twoFactorEnabled: true },
    });
    if (!record.twoFactorEnabled || !record.totpSecretEnc) {
      throw AppException.badRequest('TWO_FACTOR_NOT_ENABLED', '2FA yoqilmagan');
    }
    if (!(await this.verifyTotp(user.id, record.totpSecretEnc, code))) {
      throw invalidCode();
    }

    const backupCodes = await this.prisma.$transaction(async (tx) => {
      const codes = await this.replaceBackupCodes(tx, user.id);
      await this.audit.log(
        { action: 'auth.2fa_backup_codes_regenerated', resource: 'user', resourceId: user.id },
        tx,
      );
      return codes;
    });
    return { backupCodes };
  }

  async backupCodesRemaining(userId: string): Promise<number> {
    return this.prisma.backupCode.count({ where: { userId, usedAt: null } });
  }

  /** Login paytida: 6 xonali TOTP yoki bir martalik zaxira kod. */
  async verifyLoginCode(userId: string, rawCode: string): Promise<boolean> {
    const code = rawCode.trim();
    const record = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { totpSecretEnc: true, twoFactorEnabled: true },
    });
    if (!record?.twoFactorEnabled || !record.totpSecretEnc) return false;

    if (TOTP_CODE.test(code)) {
      return this.verifyTotp(userId, record.totpSecretEnc, code);
    }
    return this.consumeBackupCode(userId, code);
  }

  /** SUPER_ADMIN boshqa foydalanuvchining 2FA'sini tiklaydi (qurilma yo'qolganda). */
  async adminReset(userId: string): Promise<void> {
    await this.clear(userId, 'user.reset_2fa');
    await this.sessions.revokeAllForUser(userId, SessionRevokeReason.REVOKED_BY_ADMIN);
  }

  private async clear(userId: string, action: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: false, totpSecretEnc: null },
      });
      await tx.backupCode.deleteMany({ where: { userId } });
      await this.audit.log({ action, resource: 'user', resourceId: userId }, tx);
    });
    await this.authContext.invalidate(userId);
  }

  private async verifyTotp(userId: string, secretEnc: string, rawCode: string): Promise<boolean> {
    const code = rawCode.trim();
    if (!TOTP_CODE.test(code)) return false;
    if (!totp.check(code, this.encryption.decrypt(secretEnc))) return false;

    // Bir kod faqat bir marta: yelka ortidan ko'rib olingan kod qayta ishlamaydi.
    const firstUse = await this.redis.set(
      redisKeys.totpUsed(userId, code),
      '1',
      'EX',
      TOTP_REPLAY_TTL_SECONDS,
      'NX',
    );
    return firstUse === 'OK';
  }

  private async consumeBackupCode(userId: string, rawCode: string): Promise<boolean> {
    const code = normalizeBackupCode(rawCode);
    if (code.length !== BACKUP_CODE_LENGTH) return false;

    const result = await this.prisma.backupCode.updateMany({
      where: { userId, codeHash: this.hashBackupCode(code), usedAt: null },
      data: { usedAt: new Date() },
    });
    return result.count === 1;
  }

  private async replaceBackupCodes(
    tx: Pick<PrismaService, 'backupCode'>,
    userId: string,
  ): Promise<string[]> {
    const codes = Array.from({ length: BACKUP_CODE_COUNT }, generateBackupCode);
    await tx.backupCode.deleteMany({ where: { userId } });
    await tx.backupCode.createMany({
      data: codes.map((code) => ({
        userId,
        codeHash: this.hashBackupCode(normalizeBackupCode(code)),
      })),
    });
    return codes;
  }

  private hashBackupCode(normalizedCode: string): string {
    return hmacSha256Hex(this.config.auth.passwordPepper, normalizedCode);
  }
}
