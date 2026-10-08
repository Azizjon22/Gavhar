import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Paginated } from '@/common/dto/pagination.dto';
import { AppException } from '@/common/errors/app.exception';
import { ZERO, moneyString } from '@/common/utils/money.util';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { auditDiff } from '@/modules/audit/audit-sanitizer';
import { AuditService } from '@/modules/audit/audit.service';
import { CreateClientDto, ListClientsDto, UpdateClientDto } from './dto/client.dto';

const CLIENT_SELECT = {
  id: true,
  fullName: true,
  phone: true,
  phoneExtra: true,
  note: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ClientSelect;

type ClientView = Prisma.ClientGetPayload<{ select: typeof CLIENT_SELECT }>;

const SORTABLE_FIELDS = ['createdAt', 'fullName'] as const;
type SortableField = (typeof SORTABLE_FIELDS)[number];

const notFound = () => AppException.notFound('CLIENT_NOT_FOUND', 'Mijoz topilmadi');

const auditFields = ({ fullName, phone, phoneExtra, note }: ClientView) => ({
  fullName,
  phone,
  phoneExtra,
  note,
});

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListClientsDto) {
    const sortBy: SortableField = SORTABLE_FIELDS.includes(query.sortBy as SortableField)
      ? (query.sortBy as SortableField)
      : 'createdAt';

    // "90 123-45" kabi qidiruv telefon raqamidagi raqamlar bo'yicha ham ishlaydi.
    const digits = query.search?.replace(/\D/g, '') ?? '';
    const where: Prisma.ClientWhereInput = {
      deletedAt: null,
      ...(query.search && {
        OR: [
          { fullName: { contains: query.search, mode: 'insensitive' } },
          ...(digits.length >= 2
            ? [{ phone: { contains: digits } }, { phoneExtra: { contains: digits } }]
            : []),
        ],
      }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        select: CLIENT_SELECT,
        orderBy: [{ [sortBy]: query.sortOrder }, { id: 'asc' }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.client.count({ where }),
    ]);

    return Paginated.of(items, total, query);
  }

  /** Mijoz + uning bronlari bo'yicha yig'ma hisob (bekor qilinganlar hisobga kirmaydi). */
  async findOneWithStats(id: string) {
    const client = await this.findOne(id);
    const totals = await this.prisma.event.aggregate({
      where: { clientId: id, deletedAt: null, status: { not: 'CANCELLED' } },
      _count: true,
      _sum: { totalAmount: true, paidAmount: true },
    });
    const total = totals._sum.totalAmount ?? ZERO;
    const paid = totals._sum.paidAmount ?? ZERO;

    return {
      ...client,
      stats: {
        eventsCount: totals._count,
        totalAmount: moneyString(total),
        paidAmount: moneyString(paid),
        debt: moneyString(total.sub(paid)),
      },
    };
  }

  async findOne(id: string): Promise<ClientView> {
    const client = await this.prisma.client.findFirst({
      where: { id, deletedAt: null },
      select: CLIENT_SELECT,
    });
    if (!client) throw notFound();
    return client;
  }

  create(dto: CreateClientDto): Promise<ClientView> {
    return this.prisma.$transaction(async (tx) => {
      await this.assertPhoneAvailable(tx, dto.phone);

      const client = await tx.client.create({
        data: {
          fullName: dto.fullName,
          phone: dto.phone,
          phoneExtra: dto.phoneExtra || null,
          note: dto.note || null,
        },
        select: CLIENT_SELECT,
      });
      await this.audit.log(
        {
          action: 'client.create',
          resource: 'client',
          resourceId: client.id,
          after: auditFields(client),
        },
        tx,
      );
      return client;
    });
  }

  async update(id: string, dto: UpdateClientDto): Promise<ClientView> {
    const before = await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      if (dto.phone !== undefined && dto.phone !== before.phone) {
        await this.assertPhoneAvailable(tx, dto.phone, id);
      }

      const client = await tx.client.update({
        where: { id },
        data: {
          ...(dto.fullName !== undefined && { fullName: dto.fullName }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.phoneExtra !== undefined && { phoneExtra: dto.phoneExtra || null }),
          ...(dto.note !== undefined && { note: dto.note || null }),
        },
        select: CLIENT_SELECT,
      });

      const diff = auditDiff(auditFields(before), auditFields(client));
      if (diff) {
        await this.audit.log(
          { action: 'client.update', resource: 'client', resourceId: id, ...diff },
          tx,
        );
      }
      return client;
    });
  }

  async remove(id: string): Promise<void> {
    const client = await this.findOne(id);
    const activeEvents = await this.prisma.event.count({
      where: { clientId: id, deletedAt: null, status: { in: ['REQUEST', 'CONFIRMED', 'HELD'] } },
    });
    if (activeEvents > 0) {
      throw AppException.conflict(
        'CLIENT_HAS_EVENTS',
        'Bu mijozning yopilmagan bronlari bor. Avval ularni yakunlang yoki bekor qiling',
        { count: activeEvents },
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.client.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.log(
        {
          action: 'client.delete',
          resource: 'client',
          resourceId: id,
          before: auditFields(client),
        },
        tx,
      );
    });
  }

  /**
   * Bitta telefon raqami — bitta faol mijoz: tarix bir joyda yig'iladi.
   *
   * Soft delete sababli bazada oddiy UNIQUE cheklov qo'yib bo'lmaydi, shuning
   * uchun shu raqam bo'yicha tranzaksiya darajasidagi qulf olinadi — ikki
   * operator bir vaqtda bir xil raqamli mijoz qo'sha olmaydi.
   */
  private async assertPhoneAvailable(
    tx: Prisma.TransactionClient,
    phone: string,
    exceptId?: string,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`client-phone:${phone}`}))`;

    const existing = await tx.client.findFirst({
      where: { phone, deletedAt: null, ...(exceptId && { id: { not: exceptId } }) },
      select: { id: true, fullName: true },
    });
    if (existing) {
      throw AppException.conflict(
        'CLIENT_PHONE_TAKEN',
        `Bu telefon raqami bilan mijoz mavjud: ${existing.fullName}`,
        { clientId: existing.id, fullName: existing.fullName },
      );
    }
  }
}
