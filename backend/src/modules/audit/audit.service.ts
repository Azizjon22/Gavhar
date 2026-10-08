import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RequestActor, getRequestContext } from '@/common/context/request-context';
import { Paginated } from '@/common/dto/pagination.dto';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { sanitizeForAudit } from './audit-sanitizer';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';

export interface AuditEntry {
  /** `resource.verb` ko'rinishida, masalan `user.create`. */
  action: string;
  resource: string;
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
  /** Berilmasa — joriy so'rov egasi. Login kabi hali autentifikatsiya yo'q holatlar uchun. */
  actor?: Partial<RequestActor> | null;
}

const toJson = (value: unknown): Prisma.InputJsonValue | undefined => {
  const sanitized = sanitizeForAudit(value);
  return sanitized === undefined || sanitized === null ? undefined : sanitized;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tranzaksiya ichida chaqirilsa (`tx`), yozuv asosiy o'zgarish bilan birga
   * saqlanadi yoki birga bekor bo'ladi. Tranzaksiyasiz chaqirilganda audit
   * xatosi asosiy amalni buzmaydi — faqat logga yoziladi.
   */
  async log(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
    const context = getRequestContext();
    const actor = entry.actor === undefined ? context.actor : entry.actor;

    const data: Prisma.AuditLogUncheckedCreateInput = {
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId ?? null,
      before: toJson(entry.before),
      after: toJson(entry.after),
      ip: context.ip ?? null,
      userAgent: context.userAgent ?? null,
      requestId: context.requestId ?? null,
    };

    if (tx) {
      await tx.auditLog.create({ data });
      return;
    }

    try {
      await this.prisma.auditLog.create({ data });
    } catch (error) {
      this.logger.error({ err: error, action: entry.action }, 'Audit log yozilmadi');
    }
  }

  async list(query: ListAuditLogsDto) {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.actorId && { actorId: query.actorId }),
      ...(query.resource && { resource: query.resource }),
      ...(query.resourceId && { resourceId: query.resourceId }),
      ...(query.action && { action: { startsWith: query.action } }),
      ...((query.from || query.to) && {
        createdAt: { ...(query.from && { gte: query.from }), ...(query.to && { lte: query.to }) },
      }),
      ...(query.search && {
        OR: [
          { actorEmail: { contains: query.search, mode: 'insensitive' } },
          { action: { contains: query.search, mode: 'insensitive' } },
          { ip: { contains: query.search } },
        ],
      }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: query.sortOrder },
        skip: query.skip,
        take: query.take,
        include: { actor: { select: { id: true, fullName: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return Paginated.of(items, total, query);
  }
}
