import { Inject, Injectable } from '@nestjs/common';
import { Session, SessionRevokeReason } from '@prisma/client';
import { Redis } from 'ioredis';
import { getRequestContext } from '@/common/context/request-context';
import { randomToken, sha256Hex } from '@/common/crypto/token.util';
import { AppException } from '@/common/errors/app.exception';
import { AppConfigService } from '@/config/app-config.service';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { REDIS_CLIENT } from '@/infrastructure/redis/redis.constants';
import { AuditService } from '@/modules/audit/audit.service';
import { redisKeys } from '../auth.constants';

export interface IssuedSession {
  sessionId: string;
  userId: string;
  /** Ochiq ko'rinishdagi token — faqat cookie'ga yoziladi, bazada hash saqlanadi. */
  refreshToken: string;
  expiresAt: Date;
}

const REFRESH_TOKEN_BYTES = 48;

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async create(userId: string): Promise<IssuedSession> {
    const { ip, userAgent } = getRequestContext();
    const refreshToken = randomToken(REFRESH_TOKEN_BYTES);
    const expiresAt = this.nextExpiry();

    const session = await this.prisma.session.create({
      data: {
        userId,
        ip,
        userAgent,
        expiresAt,
        refreshTokens: { create: { tokenHash: sha256Hex(refreshToken), expiresAt } },
      },
    });

    return { sessionId: session.id, userId, refreshToken, expiresAt };
  }

  /**
   * Refresh token rotation. Token faqat bir marta ishlatiladi; ishlatilgan
   * token qayta kelsa, u o'g'irlangan deb hisoblanadi va foydalanuvchining
   * BARCHA sessiyalari bekor qilinadi.
   */
  async rotate(rawToken: string): Promise<IssuedSession> {
    const now = new Date();
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256Hex(rawToken) },
      include: { session: true },
    });

    if (!token) {
      throw AppException.unauthorized('INVALID_REFRESH_TOKEN', 'Sessiya topilmadi');
    }
    const { session } = token;
    if (session.revokedAt) {
      throw AppException.unauthorized('SESSION_REVOKED', 'Sessiya bekor qilingan');
    }
    if (token.usedAt) {
      return this.handleReuse(session);
    }
    if (token.expiresAt <= now) {
      throw AppException.unauthorized('REFRESH_TOKEN_EXPIRED', 'Sessiya muddati tugagan');
    }

    // Atomar "egallash": ikki parallel so'rovdan faqat bittasi o'tadi.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: token.id, usedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count === 0) {
      return this.handleReuse(session);
    }

    const { ip, userAgent } = getRequestContext();
    const refreshToken = randomToken(REFRESH_TOKEN_BYTES);
    const expiresAt = this.nextExpiry();

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        lastUsedAt: now,
        expiresAt,
        ip,
        userAgent,
        refreshTokens: { create: { tokenHash: sha256Hex(refreshToken), expiresAt } },
      },
    });

    return { sessionId: session.id, userId: session.userId, refreshToken, expiresAt };
  }

  async findSessionIdByRefreshToken(rawToken: string): Promise<string | null> {
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256Hex(rawToken) },
      select: { sessionId: true },
    });
    return token?.sessionId ?? null;
  }

  listActive(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        ip: true,
        userAgent: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
    });
  }

  /** `ownerId` berilsa, faqat shu foydalanuvchiga tegishli sessiya bekor qilinadi. */
  async revoke(sessionId: string, reason: SessionRevokeReason, ownerId?: string): Promise<boolean> {
    const result = await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null, ...(ownerId && { userId: ownerId }) },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
    if (result.count === 0) return false;

    await this.markRevoked([sessionId]);
    return true;
  }

  async revokeAllForUser(
    userId: string,
    reason: SessionRevokeReason,
    exceptSessionId?: string,
  ): Promise<number> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, ...(exceptSessionId && { id: { not: exceptSessionId } }) },
      select: { id: true },
    });
    if (sessions.length === 0) return 0;

    const ids = sessions.map((session) => session.id);
    await this.prisma.session.updateMany({
      where: { id: { in: ids } },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
    await this.markRevoked(ids);
    return ids.length;
  }

  async isRevoked(sessionId: string): Promise<boolean> {
    return (await this.redis.exists(redisKeys.revokedSession(sessionId))) === 1;
  }

  /**
   * Access token'ning qolgan umri davomida sessiya "qora ro'yxat"da turadi —
   * shu tufayli bekor qilish 15 daqiqa kutmasdan darhol kuchga kiradi.
   */
  private async markRevoked(sessionIds: string[]): Promise<void> {
    const pipeline = this.redis.pipeline();
    for (const id of sessionIds) {
      pipeline.set(redisKeys.revokedSession(id), '1', 'EX', this.config.auth.accessTtlSeconds);
    }
    await pipeline.exec();
  }

  private async handleReuse(session: Session): Promise<never> {
    const revoked = await this.revokeAllForUser(session.userId, SessionRevokeReason.TOKEN_REUSE);
    await this.audit.log({
      action: 'auth.token_reuse',
      resource: 'session',
      resourceId: session.id,
      after: { revokedSessions: revoked },
      actor: { id: session.userId },
    });
    throw AppException.unauthorized(
      'TOKEN_REUSE_DETECTED',
      'Xavfsizlik sababli barcha sessiyalar yakunlandi. Qaytadan kiring',
    );
  }

  private nextExpiry(): Date {
    return new Date(Date.now() + this.config.auth.refreshTtlSeconds * 1000);
  }
}
