import { Injectable } from '@nestjs/common';
import { Prisma, SessionRevokeReason, UserStatus } from '@prisma/client';
import { PasswordService } from '@/common/crypto/password.service';
import { Paginated } from '@/common/dto/pagination.dto';
import { AppException } from '@/common/errors/app.exception';
import { SYSTEM_ROLES } from '@/common/permissions/permission-catalog';
import { generateTemporaryPassword } from '@/common/crypto/temp-password';
import { AuthUser } from '@/common/types/auth-user';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { auditDiff } from '@/modules/audit/audit-sanitizer';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthContextService } from '@/modules/auth/services/auth-context.service';
import { LoginAttemptsService } from '@/modules/auth/services/login-attempts.service';
import { SessionsService } from '@/modules/auth/services/sessions.service';
import { TwoFactorService } from '@/modules/auth/services/two-factor.service';
import { CreateUserDto, ListUsersDto, ResetUserPasswordDto, UpdateUserDto } from './dto/user.dto';

/** Tashqariga chiqadigan maydonlar — parol hash'i va 2FA siri hech qachon qaytmaydi. */
const USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  status: true,
  mustChangePassword: true,
  twoFactorEnabled: true,
  lastLoginAt: true,
  lastLoginIp: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { id: true, key: true, name: true } },
} satisfies Prisma.UserSelect;

type UserView = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

const SORTABLE_FIELDS = ['createdAt', 'fullName', 'email', 'lastLoginAt'] as const;
type SortableField = (typeof SORTABLE_FIELDS)[number];

const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } as const;

const notFound = () => AppException.notFound('USER_NOT_FOUND', 'Foydalanuvchi topilmadi');
const emailTaken = () =>
  AppException.conflict('EMAIL_TAKEN', 'Bu email bilan foydalanuvchi mavjud');

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

const isActiveSuperAdmin = (user: UserView): boolean =>
  user.role.key === SYSTEM_ROLES.SUPER_ADMIN && user.status === UserStatus.ACTIVE;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionsService,
    private readonly authContext: AuthContextService,
    private readonly twoFactor: TwoFactorService,
    private readonly loginAttempts: LoginAttemptsService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListUsersDto) {
    const sortBy: SortableField = SORTABLE_FIELDS.includes(query.sortBy as SortableField)
      ? (query.sortBy as SortableField)
      : 'createdAt';

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.roleId && { roleId: query.roleId }),
      ...(query.status && { status: query.status }),
      ...(query.search && {
        OR: [
          { fullName: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search } },
        ],
      }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: [{ [sortBy]: query.sortOrder }, { id: 'asc' }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.user.count({ where }),
    ]);

    return Paginated.of(items, total, query);
  }

  async findOne(id: string): Promise<UserView> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: USER_SELECT,
    });
    if (!user) throw notFound();
    return user;
  }

  async create(dto: CreateUserDto, actor: AuthUser): Promise<UserView> {
    await this.assertRoleExists(dto.roleId);
    if (await this.prisma.user.findUnique({ where: { email: dto.email }, select: { id: true } })) {
      throw emailTaken();
    }

    const passwordHash = await this.passwords.hash(dto.password);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: dto.email,
            fullName: dto.fullName,
            phone: dto.phone ?? null,
            roleId: dto.roleId,
            passwordHash,
            mustChangePassword: true,
            createdById: actor.id,
          },
          select: USER_SELECT,
        });
        await this.audit.log(
          { action: 'user.create', resource: 'user', resourceId: user.id, after: user },
          tx,
        );
        return user;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw emailTaken();
      throw error;
    }
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserView> {
    if (dto.roleId) await this.assertRoleExists(dto.roleId);

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const before = await this.findForUpdate(tx, id);

        if (dto.roleId && dto.roleId !== before.role.id && isActiveSuperAdmin(before)) {
          await this.assertNotLastSuperAdmin(tx, id);
        }

        const after = await tx.user.update({
          where: { id },
          data: {
            ...(dto.email !== undefined && { email: dto.email }),
            ...(dto.fullName !== undefined && { fullName: dto.fullName }),
            ...(dto.phone !== undefined && { phone: dto.phone }),
            ...(dto.roleId !== undefined && { roleId: dto.roleId }),
          },
          select: USER_SELECT,
        });

        const diff = auditDiff(
          {
            email: before.email,
            fullName: before.fullName,
            phone: before.phone,
            role: before.role.name,
          },
          {
            email: after.email,
            fullName: after.fullName,
            phone: after.phone,
            role: after.role.name,
          },
        );
        if (diff) {
          await this.audit.log(
            { action: 'user.update', resource: 'user', resourceId: id, ...diff },
            tx,
          );
        }
        return { after, roleChanged: before.role.id !== after.role.id };
      }, SERIALIZABLE);

      await this.authContext.invalidate(id);
      if (updated.roleChanged) {
        // Yangi rol bilan qayta kirishi uchun — eski ruxsatli tokenlar yopiladi.
        await this.sessions.revokeAllForUser(id, SessionRevokeReason.SECURITY_CHANGE);
      }
      return updated.after;
    } catch (error) {
      if (isUniqueViolation(error)) throw emailTaken();
      throw error;
    }
  }

  async setStatus(id: string, status: UserStatus, actor: AuthUser): Promise<UserView> {
    if (id === actor.id) {
      throw AppException.badRequest('CANNOT_MODIFY_SELF', "O'z hisobingizni bloklay olmaysiz");
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const before = await this.findForUpdate(tx, id);
      if (before.status === status) return before;

      if (status === UserStatus.BLOCKED && isActiveSuperAdmin(before)) {
        await this.assertNotLastSuperAdmin(tx, id);
      }

      const after = await tx.user.update({ where: { id }, data: { status }, select: USER_SELECT });
      await this.audit.log(
        {
          action: status === UserStatus.BLOCKED ? 'user.block' : 'user.unblock',
          resource: 'user',
          resourceId: id,
          before: { status: before.status },
          after: { status },
        },
        tx,
      );
      return after;
    }, SERIALIZABLE);

    await this.authContext.invalidate(id);
    if (status === UserStatus.BLOCKED) {
      await this.sessions.revokeAllForUser(id, SessionRevokeReason.USER_BLOCKED);
    }
    return user;
  }

  async resetPassword(id: string, dto: ResetUserPasswordDto, actor: AuthUser): Promise<void> {
    if (id === actor.id) {
      throw AppException.badRequest(
        'CANNOT_MODIFY_SELF',
        "O'z parolingizni profil sahifasida o'zgartiring",
      );
    }
    const user = await this.findOne(id);
    await this.applyPasswordReset(user, dto.newPassword);
  }

  /**
   * Server konsolidan tiklash (`pnpm user:reset-password`): parolini unutgan yagona
   * SUPER_ADMIN'ni hech kim interfeys orqali tiklay olmaydi — bu yo'l serverga
   * kirish huquqi bor egasi uchun. Yangi vaqtinchalik parolni qaytaradi.
   */
  async recoverAccess(email: string, options: { resetTwoFactor?: boolean } = {}) {
    const user = await this.prisma.user.findFirst({
      where: { email: email.trim().toLowerCase(), deletedAt: null },
      select: USER_SELECT,
    });
    if (!user) throw AppException.notFound('USER_NOT_FOUND', 'Foydalanuvchi topilmadi');

    const temporaryPassword = generateTemporaryPassword();
    await this.applyPasswordReset(user, temporaryPassword, { via: 'server-console' });
    if (options.resetTwoFactor && user.twoFactorEnabled) {
      await this.twoFactor.adminReset(user.id);
    }
    return {
      email: user.email,
      fullName: user.fullName,
      role: user.role.name,
      temporaryPassword,
      twoFactorReset: options.resetTwoFactor === true && user.twoFactorEnabled,
    };
  }

  /** Yangi vaqtinchalik parol: birinchi kirishda almashtiriladi, eski sessiyalar yopiladi. */
  private async applyPasswordReset(
    user: { id: string; email: string },
    newPassword: string,
    details?: Record<string, string>,
  ): Promise<void> {
    const passwordHash = await this.passwords.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: true, passwordChangedAt: new Date() },
      });
      await this.audit.log(
        {
          action: 'user.reset_password',
          resource: 'user',
          resourceId: user.id,
          ...(details && { after: details }),
        },
        tx,
      );
    });

    await this.authContext.invalidate(user.id);
    await this.sessions.revokeAllForUser(user.id, SessionRevokeReason.REVOKED_BY_ADMIN);
    // Parolini unutib ko'p marta xato tergan xodim bloklangan bo'lishi mumkin.
    await this.loginAttempts.unlock(user.email);
  }

  async resetTwoFactor(id: string, actor: AuthUser): Promise<void> {
    if (id === actor.id) {
      throw AppException.badRequest(
        'CANNOT_MODIFY_SELF',
        "O'z 2FA sozlamangizni profil sahifasida boshqaring",
      );
    }
    await this.findOne(id);
    await this.twoFactor.adminReset(id);
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    if (id === actor.id) {
      throw AppException.badRequest('CANNOT_MODIFY_SELF', "O'z hisobingizni o'chira olmaysiz");
    }

    await this.prisma.$transaction(async (tx) => {
      const before = await this.findForUpdate(tx, id);
      if (isActiveSuperAdmin(before)) {
        await this.assertNotLastSuperAdmin(tx, id);
      }

      const deletedAt = new Date();
      await tx.user.update({
        where: { id },
        data: {
          deletedAt,
          status: UserStatus.BLOCKED,
          // Email keyinchalik yangi foydalanuvchi uchun bo'shaydi.
          email: `${before.email}#deleted-${deletedAt.getTime()}`,
          twoFactorEnabled: false,
          totpSecretEnc: null,
        },
      });
      await tx.backupCode.deleteMany({ where: { userId: id } });
      await this.audit.log({ action: 'user.delete', resource: 'user', resourceId: id, before }, tx);
    }, SERIALIZABLE);

    await this.authContext.invalidate(id);
    await this.sessions.revokeAllForUser(id, SessionRevokeReason.USER_DELETED);
  }

  async listSessions(id: string) {
    await this.findOne(id);
    return this.sessions.listActive(id);
  }

  async revokeSession(id: string, sessionId: string): Promise<void> {
    await this.findOne(id);
    if (!(await this.sessions.revoke(sessionId, SessionRevokeReason.REVOKED_BY_ADMIN, id))) {
      throw AppException.notFound('SESSION_NOT_FOUND', 'Sessiya topilmadi');
    }
    await this.audit.log({
      action: 'session.revoke_by_admin',
      resource: 'session',
      resourceId: sessionId,
      after: { userId: id },
    });
  }

  async revokeAllSessions(id: string): Promise<{ revoked: number }> {
    await this.findOne(id);
    const revoked = await this.sessions.revokeAllForUser(id, SessionRevokeReason.REVOKED_BY_ADMIN);
    if (revoked > 0) {
      await this.audit.log({
        action: 'session.revoke_all_by_admin',
        resource: 'user',
        resourceId: id,
        after: { revokedSessions: revoked },
      });
    }
    return { revoked };
  }

  private async findForUpdate(tx: Prisma.TransactionClient, id: string): Promise<UserView> {
    const user = await tx.user.findFirst({ where: { id, deletedAt: null }, select: USER_SELECT });
    if (!user) throw notFound();
    return user;
  }

  private async assertRoleExists(roleId: string): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { id: roleId }, select: { id: true } });
    if (!role) throw AppException.badRequest('ROLE_NOT_FOUND', 'Rol topilmadi');
  }

  /** Tizimda kamida bitta faol SUPER_ADMIN qolishi shart. */
  private async assertNotLastSuperAdmin(tx: Prisma.TransactionClient, userId: string) {
    const others = await tx.user.count({
      where: {
        id: { not: userId },
        deletedAt: null,
        status: UserStatus.ACTIVE,
        role: { key: SYSTEM_ROLES.SUPER_ADMIN },
      },
    });
    if (others === 0) {
      throw AppException.conflict(
        'LAST_SUPER_ADMIN',
        "Tizimdagi oxirgi SUPER_ADMIN'ni o'chirib, bloklab yoki rolini o'zgartirib bo'lmaydi",
      );
    }
  }
}
