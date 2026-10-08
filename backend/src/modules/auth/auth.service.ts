import { Inject, Injectable } from '@nestjs/common';
import { SessionRevokeReason, UserStatus } from '@prisma/client';
import { Redis } from 'ioredis';
import { getRequestContext } from '@/common/context/request-context';
import { PasswordService } from '@/common/crypto/password.service';
import { randomToken } from '@/common/crypto/token.util';
import { AppException } from '@/common/errors/app.exception';
import { SYSTEM_ROLES } from '@/common/permissions/permission-catalog';
import { AuthUser } from '@/common/types/auth-user';
import { AppConfigService } from '@/config/app-config.service';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { REDIS_CLIENT } from '@/infrastructure/redis/redis.constants';
import { AuditService } from '@/modules/audit/audit.service';
import {
  TWO_FACTOR_CHALLENGE_MAX_ATTEMPTS,
  TWO_FACTOR_CHALLENGE_TTL_SECONDS,
  redisKeys,
} from './auth.constants';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { TwoFactorLoginDto } from './dto/two-factor.dto';
import { AuthContextService, CachedAuthUser } from './services/auth-context.service';
import { LoginAttemptsService } from './services/login-attempts.service';
import { IssuedSession, SessionsService } from './services/sessions.service';
import { TokenService } from './services/token.service';
import { TwoFactorService } from './services/two-factor.service';

export interface AuthProfile {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: { id: string; key: string; name: string };
  permissions: string[];
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
  /** Bu foydalanuvchi uchun 2FA majburiymi (SUPER_ADMIN + `SUPER_ADMIN_2FA_REQUIRED`). */
  twoFactorRequired: boolean;
  /** Majburiy 2FA hali ulanmagan — ulanmaguncha tizim cheklangan. */
  mustSetupTwoFactor: boolean;
}

export interface AuthTokens {
  accessToken: string;
  expiresIn: number;
  user: AuthProfile;
  session: IssuedSession;
}

export type LoginResult =
  { requiresTwoFactor: true; challengeToken: string } | ({ requiresTwoFactor: false } & AuthTokens);

interface TwoFactorChallenge {
  userId: string;
  email: string;
  attempts: number;
}

const invalidCredentials = () =>
  AppException.unauthorized('INVALID_CREDENTIALS', "Email yoki parol noto'g'ri");

/** `superAdminTwoFactorRequired` — `SUPER_ADMIN_2FA_REQUIRED` sozlamasi. */
export const toAuthProfile = (
  user: Omit<AuthUser, 'sessionId'>,
  superAdminTwoFactorRequired: boolean,
): AuthProfile => {
  const twoFactorRequired =
    superAdminTwoFactorRequired && user.roleKey === SYSTEM_ROLES.SUPER_ADMIN;
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    role: { id: user.roleId, key: user.roleKey, name: user.roleName },
    permissions: user.permissions,
    mustChangePassword: user.mustChangePassword,
    twoFactorEnabled: user.twoFactorEnabled,
    twoFactorRequired,
    mustSetupTwoFactor: twoFactorRequired && !user.twoFactorEnabled,
  };
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly attempts: LoginAttemptsService,
    private readonly sessions: SessionsService,
    private readonly tokens: TokenService,
    private readonly twoFactor: TwoFactorService,
    private readonly authContext: AuthContextService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  profileOf(user: Omit<AuthUser, 'sessionId'>): AuthProfile {
    return toAuthProfile(user, this.config.auth.superAdminTwoFactorRequired);
  }

  async login(dto: LoginDto): Promise<LoginResult> {
    const { email, password } = dto;
    await this.attempts.assertNotLocked(email);

    const user = await this.prisma.user.findFirst({ where: { email, deletedAt: null } });
    const passwordOk = user
      ? await this.passwords.verify(user.passwordHash, password)
      : await this.passwords.verifyDummy(password);

    if (!user || !passwordOk) {
      await this.audit.log({
        action: 'auth.login_failed',
        resource: 'auth',
        after: { reason: 'invalid_credentials' },
        actor: { id: user?.id, email },
      });
      await this.attempts.registerFailure(email);
      throw invalidCredentials();
    }

    if (user.status === UserStatus.BLOCKED) {
      await this.audit.log({
        action: 'auth.login_failed',
        resource: 'auth',
        after: { reason: 'blocked' },
        actor: { id: user.id, email },
      });
      throw AppException.forbidden(
        'ACCOUNT_BLOCKED',
        'Hisob bloklangan. Administratorga murojaat qiling',
      );
    }

    if (this.passwords.needsRehash(user.passwordHash)) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await this.passwords.hash(password) },
      });
    }

    if (user.twoFactorEnabled) {
      // Parol to'g'ri, lekin urinishlar hisobi faqat 2FA ham o'tgach tozalanadi.
      const challengeToken = randomToken(32);
      const challenge: TwoFactorChallenge = { userId: user.id, email, attempts: 0 };
      await this.redis.set(
        redisKeys.twoFactorChallenge(challengeToken),
        JSON.stringify(challenge),
        'EX',
        TWO_FACTOR_CHALLENGE_TTL_SECONDS,
      );
      return { requiresTwoFactor: true, challengeToken };
    }

    await this.attempts.reset(email);
    return { requiresTwoFactor: false, ...(await this.completeLogin(user.id, email)) };
  }

  async verifyTwoFactorLogin(dto: TwoFactorLoginDto): Promise<AuthTokens> {
    const key = redisKeys.twoFactorChallenge(dto.challengeToken);
    const raw = await this.redis.get(key);
    if (!raw) {
      throw AppException.unauthorized(
        'TWO_FACTOR_CHALLENGE_EXPIRED',
        'Tasdiqlash muddati tugadi. Qaytadan kiring',
      );
    }
    const challenge = JSON.parse(raw) as TwoFactorChallenge;
    await this.attempts.assertNotLocked(challenge.email);

    if (!(await this.twoFactor.verifyLoginCode(challenge.userId, dto.code))) {
      const attempts = challenge.attempts + 1;
      if (attempts >= TWO_FACTOR_CHALLENGE_MAX_ATTEMPTS) {
        await this.redis.del(key);
      } else {
        await this.redis.set(key, JSON.stringify({ ...challenge, attempts }), 'KEEPTTL');
      }
      await this.audit.log({
        action: 'auth.login_failed',
        resource: 'auth',
        after: { reason: 'invalid_2fa_code' },
        actor: { id: challenge.userId, email: challenge.email },
      });
      await this.attempts.registerFailure(challenge.email);
      throw AppException.unauthorized('INVALID_2FA_CODE', "Tasdiqlash kodi noto'g'ri");
    }

    await this.redis.del(key);
    await this.attempts.reset(challenge.email);
    return this.completeLogin(challenge.userId, challenge.email);
  }

  async refresh(rawRefreshToken: string | undefined): Promise<AuthTokens> {
    if (!rawRefreshToken) {
      throw AppException.unauthorized('INVALID_REFRESH_TOKEN', 'Sessiya topilmadi');
    }
    const session = await this.sessions.rotate(rawRefreshToken);
    const user = await this.loadActiveUser(session.userId);
    return this.issueTokens(user, session);
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) return;
    const sessionId = await this.sessions.findSessionIdByRefreshToken(rawRefreshToken);
    if (!sessionId) return;

    if (await this.sessions.revoke(sessionId, SessionRevokeReason.LOGOUT)) {
      const session = await this.prisma.session.findUnique({
        where: { id: sessionId },
        select: { user: { select: { id: true, email: true } } },
      });
      await this.audit.log({
        action: 'auth.logout',
        resource: 'session',
        resourceId: sessionId,
        actor: session?.user,
      });
    }
  }

  async changePassword(user: AuthUser, dto: ChangePasswordDto): Promise<void> {
    const record = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (!(await this.passwords.verify(record.passwordHash, dto.currentPassword))) {
      throw AppException.badRequest('INVALID_PASSWORD', "Joriy parol noto'g'ri");
    }
    if (dto.newPassword === dto.currentPassword) {
      throw AppException.badRequest(
        'PASSWORD_UNCHANGED',
        'Yangi parol joriy paroldan farq qilishi kerak',
      );
    }

    const passwordHash = await this.passwords.hash(dto.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date() },
      });
      await this.audit.log(
        { action: 'auth.password_changed', resource: 'user', resourceId: user.id },
        tx,
      );
    });

    await this.authContext.invalidate(user.id);
    await this.sessions.revokeAllForUser(
      user.id,
      SessionRevokeReason.PASSWORD_CHANGED,
      user.sessionId,
    );
  }

  private async completeLogin(userId: string, email: string): Promise<AuthTokens> {
    const { ip } = getRequestContext();
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date(), lastLoginIp: ip },
    });
    await this.authContext.invalidate(userId);

    const user = await this.loadActiveUser(userId);
    const session = await this.sessions.create(userId);
    await this.audit.log({
      action: 'auth.login',
      resource: 'session',
      resourceId: session.sessionId,
      actor: { id: userId, email },
    });
    return this.issueTokens(user, session);
  }

  private async loadActiveUser(userId: string): Promise<CachedAuthUser> {
    const user = await this.authContext.load(userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw AppException.unauthorized('ACCOUNT_UNAVAILABLE', 'Hisob faol emas');
    }
    return user;
  }

  private async issueTokens(user: CachedAuthUser, session: IssuedSession): Promise<AuthTokens> {
    return {
      accessToken: await this.tokens.signAccessToken({ sub: user.id, sid: session.sessionId }),
      expiresIn: this.tokens.accessTtlSeconds,
      user: this.profileOf(user),
      session,
    };
  }
}
