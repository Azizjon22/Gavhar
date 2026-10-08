import { Inject, Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { Redis } from 'ioredis';
import { ALL_PERMISSION_KEYS, SYSTEM_ROLES } from '@/common/permissions/permission-catalog';
import { AuthUser } from '@/common/types/auth-user';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { REDIS_CLIENT } from '@/infrastructure/redis/redis.constants';
import { AUTH_CONTEXT_TTL_SECONDS, redisKeys } from '../auth.constants';

export type CachedAuthUser = Omit<AuthUser, 'sessionId'> & { status: UserStatus };

/**
 * Har so'rovda kerak bo'ladigan foydalanuvchi + rol + ruxsatlar. Bazaga har
 * safar bormaslik uchun Redis'da qisqa muddat keshlanadi; foydalanuvchi yoki
 * rol o'zgarganda kesh darhol tozalanadi.
 */
@Injectable()
export class AuthContextService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async load(userId: string): Promise<CachedAuthUser | null> {
    const key = redisKeys.authContext(userId);
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached) as CachedAuthUser;

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        role: { include: { permissions: { include: { permission: { select: { key: true } } } } } },
      },
    });
    if (!user) return null;

    const context: CachedAuthUser = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      roleId: user.roleId,
      roleKey: user.role.key,
      roleName: user.role.name,
      permissions:
        user.role.key === SYSTEM_ROLES.SUPER_ADMIN
          ? [...ALL_PERMISSION_KEYS]
          : user.role.permissions.map((rp) => rp.permission.key).sort(),
      mustChangePassword: user.mustChangePassword,
      twoFactorEnabled: user.twoFactorEnabled,
      status: user.status,
    };

    await this.redis.set(key, JSON.stringify(context), 'EX', AUTH_CONTEXT_TTL_SECONDS);
    return context;
  }

  async invalidate(...userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    await this.redis.del(...userIds.map(redisKeys.authContext));
  }

  async invalidateRole(roleId: string): Promise<void> {
    const users = await this.prisma.user.findMany({ where: { roleId }, select: { id: true } });
    await this.invalidate(...users.map((user) => user.id));
  }
}
