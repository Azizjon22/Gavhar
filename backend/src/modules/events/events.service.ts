import { Injectable } from '@nestjs/common';
import { Currency, EventStatus, HallStatus, PaymentKind, Prisma } from '@prisma/client';
import { Paginated } from '@/common/dto/pagination.dto';
import { AppException } from '@/common/errors/app.exception';
import { AuthUser } from '@/common/types/auth-user';
import { localDate, toDbDate } from '@/common/utils/app-date.util';
import { Money, ZERO, money, moneyString } from '@/common/utils/money.util';
import { AppConfigService } from '@/config/app-config.service';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { SettingsService } from '@/modules/settings/settings.service';
import {
  CalendarQueryDto,
  CreateEventDto,
  CreatePaymentDto,
  EventServiceItemDto,
  ListEventsDto,
  UpdateEventDto,
} from './dto/event.dto';
import { calculatePricing, requiredDeposit, serviceTotal, toUzs } from './event-pricing';

const SUMMARY_INCLUDE = {
  client: { select: { id: true, fullName: true, phone: true } },
  hall: { select: { id: true, name: true } },
} satisfies Prisma.EventInclude;

const DETAIL_INCLUDE = {
  ...SUMMARY_INCLUDE,
  services: { orderBy: { name: 'asc' } },
  payments: { where: { deletedAt: null }, orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }] },
} satisfies Prisma.EventInclude;

type EventSummary = Prisma.EventGetPayload<{ include: typeof SUMMARY_INCLUDE }>;
export type EventDetail = Prisma.EventGetPayload<{ include: typeof DETAIL_INCLUDE }>;

type Tx = Prisma.TransactionClient;

interface ServiceLine {
  extraServiceId: string;
  name: string;
  unit: EventDetail['services'][number]['unit'];
  unitPrice: Money;
  quantity: number;
  total: Money;
}

/** Vaqtni band qilib turadigan holatlar. */
const ACTIVE_STATUSES: EventStatus[] = [
  EventStatus.REQUEST,
  EventStatus.CONFIRMED,
  EventStatus.HELD,
];
const EDITABLE_STATUSES = new Set<EventStatus>(ACTIVE_STATUSES);
const MAX_DURATION_MS = 48 * 60 * 60 * 1000;
const MAX_CALENDAR_RANGE_MS = 100 * 24 * 60 * 60 * 1000;
const OVERLAP_CONSTRAINT = 'events_hall_time_excl';

const SORTABLE_FIELDS = ['startAt', 'createdAt', 'totalAmount', 'number'] as const;
type SortableField = (typeof SORTABLE_FIELDS)[number];

const notFound = () => AppException.notFound('EVENT_NOT_FOUND', 'Bron topilmadi');

const isOverlapViolation = (error: unknown): boolean =>
  error instanceof Error &&
  (error.message.includes(OVERLAP_CONSTRAINT) || error.message.includes('23P01'));

const summaryView = (event: EventSummary) => {
  const debt = event.totalAmount.sub(event.paidAmount);
  return {
    id: event.id,
    number: event.number,
    type: event.type,
    status: event.status,
    title: event.title,
    startAt: event.startAt,
    endAt: event.endAt,
    guestCount: event.guestCount,
    tableCapacity: event.tableCapacity,
    firstDish: event.firstDish,
    secondDish: event.secondDish,
    totalAmount: moneyString(event.totalAmount),
    paidAmount: moneyString(event.paidAmount),
    debt: moneyString(debt.isNegative() ? ZERO : debt),
    client: event.client,
    hall: event.hall,
    menuPackage: event.menuPackageName
      ? { id: event.menuPackageId, name: event.menuPackageName }
      : null,
  };
};

const auditFields = (event: EventDetail) => ({
  number: event.number,
  client: event.client.fullName,
  hall: event.hall.name,
  menuPackage: event.menuPackageName,
  tableCapacity: event.tableCapacity,
  firstDish: event.firstDish,
  secondDish: event.secondDish,
  type: event.type,
  status: event.status,
  title: event.title,
  startAt: event.startAt,
  endAt: event.endAt,
  guestCount: event.guestCount,
  pricePerGuest: moneyString(event.pricePerGuest),
  discount: moneyString(event.discount),
  totalAmount: moneyString(event.totalAmount),
  services: event.services.map((service) => `${service.name} × ${service.quantity}`),
  note: event.note,
});

/** `priceFromPackage` — so'rov pulni ko'rmaydigan roldan: narx va chegirma undan qabul qilinmaydi. */
export interface PricingPolicy {
  priceFromPackage?: boolean;
}

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
  ) {}

  // ── O'qish ───────────────────────────────────────────────────────────────

  async list(query: ListEventsDto) {
    const sortBy: SortableField = SORTABLE_FIELDS.includes(query.sortBy as SortableField)
      ? (query.sortBy as SortableField)
      : 'startAt';
    const digits = query.search?.replace(/\D/g, '') ?? '';

    const where: Prisma.EventWhereInput = {
      deletedAt: null,
      ...(query.status && { status: query.status }),
      ...(query.hallId && { hallId: query.hallId }),
      ...(query.clientId && { clientId: query.clientId }),
      ...((query.from || query.to) && {
        startAt: { ...(query.from && { gte: query.from }), ...(query.to && { lte: query.to }) },
      }),
      ...(query.debtOnly && {
        status: query.status ?? { not: EventStatus.CANCELLED },
        paidAmount: { lt: this.prisma.event.fields.totalAmount },
      }),
      ...(query.search && {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { client: { fullName: { contains: query.search, mode: 'insensitive' } } },
          ...(digits.length >= 2 ? [{ client: { phone: { contains: digits } } }] : []),
          ...(/^\d{1,9}$/.test(query.search) ? [{ number: Number(query.search) }] : []),
        ],
      }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        where,
        include: SUMMARY_INCLUDE,
        orderBy: [{ [sortBy]: query.sortOrder }, { id: 'asc' }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.event.count({ where }),
    ]);
    return Paginated.of(items.map(summaryView), total, query);
  }

  /** Kalendar uchun: berilgan oraliqqa to'g'ri keladigan barcha bronlar (yengil ko'rinishda). */
  async calendar(query: CalendarQueryDto) {
    const range = query.to.getTime() - query.from.getTime();
    if (range <= 0 || range > MAX_CALENDAR_RANGE_MS) {
      throw AppException.badRequest(
        'INVALID_DATE_RANGE',
        "Sana oralig'i noto'g'ri (ko'pi bilan 100 kun)",
      );
    }
    const events = await this.prisma.event.findMany({
      where: { deletedAt: null, startAt: { lt: query.to }, endAt: { gt: query.from } },
      include: SUMMARY_INCLUDE,
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
    });
    return events.map(summaryView);
  }

  async findOne(id: string) {
    const [event, { minDepositPercent }] = await Promise.all([
      this.findRecord(this.prisma, id),
      this.settings.getBooking(),
    ]);
    return this.detailView(event, minDepositPercent);
  }

  /** PDF va boshqa ichki ehtiyojlar uchun xom yozuv. */
  findDetail(id: string): Promise<EventDetail> {
    return this.findRecord(this.prisma, id);
  }

  // ── Yaratish va tahrirlash ───────────────────────────────────────────────

  async create(dto: CreateEventDto, policy: PricingPolicy = {}) {
    this.assertTimeRange(dto.startAt, dto.endAt);
    await this.assertClientExists(dto.clientId);
    await this.assertHallBookable(dto.hallId, dto.guestCount);

    const menuPackage = dto.menuPackageId ? await this.loadMenuPackage(dto.menuPackageId) : null;

    const services = await this.buildServiceLines(dto.services ?? [], [], dto.guestCount);
    // Pulni ko'rmaydigan rol narx va chegirma kiritmaydi: narx paketdan olinadi.
    const discount = policy.priceFromPackage ? ZERO : money(dto.discount ?? '0');
    const pricePerGuest = policy.priceFromPackage
      ? this.packagePrice(menuPackage)
      : money(this.requirePrice(dto.pricePerGuest));
    const pricing = calculatePricing({
      guestCount: dto.guestCount,
      pricePerGuest,
      discount,
      services,
    });
    await this.assertHallFree(dto.hallId, dto.startAt, dto.endAt);

    const event = await this.guardOverlap(() =>
      this.prisma.$transaction(async (tx) => {
        const created = await tx.event.create({
          data: {
            clientId: dto.clientId,
            hallId: dto.hallId,
            menuPackageId: menuPackage?.id ?? null,
            menuPackageName: menuPackage?.name ?? null,
            type: dto.type,
            title: dto.title || null,
            startAt: dto.startAt,
            endAt: dto.endAt,
            guestCount: dto.guestCount,
            tableCapacity: dto.tableCapacity ?? null,
            firstDish: dto.firstDish || null,
            secondDish: dto.secondDish || null,
            pricePerGuest,
            extrasTotal: pricing.extrasTotal,
            discount,
            totalAmount: pricing.totalAmount,
            note: dto.note || null,
            services: { create: services },
          },
          include: DETAIL_INCLUDE,
        });
        await this.audit.log(
          {
            action: 'event.create',
            resource: 'event',
            resourceId: created.id,
            after: auditFields(created),
          },
          tx,
        );
        return created;
      }),
    );
    return this.detailView(event, (await this.settings.getBooking()).minDepositPercent);
  }

  async update(id: string, dto: UpdateEventDto, policy: PricingPolicy = {}) {
    const before = await this.findRecord(this.prisma, id);
    if (!EDITABLE_STATUSES.has(before.status)) {
      throw AppException.conflict(
        'EVENT_NOT_EDITABLE',
        "Yakunlangan yoki bekor qilingan bronni o'zgartirib bo'lmaydi",
      );
    }

    const startAt = dto.startAt ?? before.startAt;
    const endAt = dto.endAt ?? before.endAt;
    const hallId = dto.hallId ?? before.hallId;
    const guestCount = dto.guestCount ?? before.guestCount;
    const scheduleChanged =
      hallId !== before.hallId ||
      startAt.getTime() !== before.startAt.getTime() ||
      endAt.getTime() !== before.endAt.getTime();

    if (scheduleChanged && before.status === EventStatus.HELD) {
      throw AppException.conflict(
        'EVENT_ALREADY_HELD',
        "O'tkazilgan tadbirning zali yoki vaqtini o'zgartirib bo'lmaydi",
      );
    }
    this.assertTimeRange(startAt, endAt);
    if (dto.clientId && dto.clientId !== before.clientId)
      await this.assertClientExists(dto.clientId);

    if (hallId !== before.hallId) {
      await this.assertHallBookable(hallId, guestCount);
    } else if (guestCount !== before.guestCount) {
      await this.assertCapacity(hallId, guestCount);
    }

    // Paket o'zgarsa — yangisining nomi olinadi; o'zgarmasa bron paytidagi nom saqlanadi.
    let menuPackage: { menuPackageId: string | null; menuPackageName: string | null } | undefined;
    let newPackagePrice: Money | null = null;
    if (dto.menuPackageId !== undefined && dto.menuPackageId !== before.menuPackageId) {
      const selected = dto.menuPackageId ? await this.loadMenuPackage(dto.menuPackageId) : null;
      if (policy.priceFromPackage) newPackagePrice = this.packagePrice(selected);
      menuPackage = {
        menuPackageId: selected?.id ?? null,
        menuPackageName: selected?.name ?? null,
      };
    }

    const requested: EventServiceItemDto[] =
      dto.services ??
      before.services.map(({ extraServiceId, quantity }) => ({ extraServiceId, quantity }));
    const services = await this.buildServiceLines(requested, before.services, guestCount);
    // Pulni ko'rmaydigan rol narxga tegmaydi: kelishilgan narx saqlanadi, faqat boshqa
    // paketga o'tilganda o'sha paket narxi olinadi.
    const discount =
      !policy.priceFromPackage && dto.discount !== undefined
        ? money(dto.discount)
        : before.discount;
    const pricePerGuest = policy.priceFromPackage
      ? (newPackagePrice ?? before.pricePerGuest)
      : dto.pricePerGuest !== undefined
        ? money(dto.pricePerGuest)
        : before.pricePerGuest;
    const pricing = calculatePricing({ guestCount, pricePerGuest, discount, services });

    if (pricing.totalAmount.lt(before.paidAmount)) {
      throw AppException.conflict(
        'TOTAL_BELOW_PAID',
        "Yangi summa to'langan summadan kam. Avval ortiqcha to'lovni qaytaring",
        {
          paidAmount: moneyString(before.paidAmount),
          totalAmount: moneyString(pricing.totalAmount),
        },
      );
    }
    if (scheduleChanged) await this.assertHallFree(hallId, startAt, endAt, id);

    const event = await this.guardOverlap(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.eventService.deleteMany({ where: { eventId: id } });
        const updated = await tx.event.update({
          where: { id },
          data: {
            ...(dto.clientId !== undefined && { clientId: dto.clientId }),
            ...(dto.type !== undefined && { type: dto.type }),
            ...(dto.title !== undefined && { title: dto.title || null }),
            ...(dto.note !== undefined && { note: dto.note || null }),
            ...(dto.tableCapacity !== undefined && { tableCapacity: dto.tableCapacity }),
            ...(dto.firstDish !== undefined && { firstDish: dto.firstDish || null }),
            ...(dto.secondDish !== undefined && { secondDish: dto.secondDish || null }),
            ...menuPackage,
            hallId,
            startAt,
            endAt,
            guestCount,
            pricePerGuest,
            discount,
            extrasTotal: pricing.extrasTotal,
            totalAmount: pricing.totalAmount,
            services: { create: services },
          },
          include: DETAIL_INCLUDE,
        });
        // To'y xarajatlari to'y kuniga yoziladi — sana ko'chsa, ular ham ko'chadi.
        if (scheduleChanged) {
          await tx.expense.updateMany({
            where: { eventId: id, deletedAt: null },
            data: { spentOn: toDbDate(localDate(startAt, this.config.app.timezone)) },
          });
        }
        await this.audit.log(
          {
            action: 'event.update',
            resource: 'event',
            resourceId: id,
            before: auditFields(before),
            after: auditFields(updated),
          },
          tx,
        );
        return updated;
      }),
    );
    return this.detailView(event, (await this.settings.getBooking()).minDepositPercent);
  }

  /** Faqat pul qabul qilinmagan so'rov yoki bekor qilingan bronni o'chirish mumkin. */
  async remove(id: string): Promise<void> {
    const event = await this.findRecord(this.prisma, id);
    const removable =
      event.paidAmount.isZero() &&
      (event.status === EventStatus.REQUEST || event.status === EventStatus.CANCELLED);
    if (!removable) {
      throw AppException.conflict(
        'EVENT_DELETE_FORBIDDEN',
        "To'lovi bor yoki tasdiqlangan bronni o'chirib bo'lmaydi — uni bekor qiling",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.event.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.log(
        { action: 'event.delete', resource: 'event', resourceId: id, before: auditFields(event) },
        tx,
      );
    });
  }

  // ── Holat o'tishlari ─────────────────────────────────────────────────────

  /** SO'ROV → TASDIQLANGAN: zaklad to'langan bo'lishi shart. */
  async confirm(id: string) {
    const { minDepositPercent } = await this.settings.getBooking();
    return this.transition(
      id,
      'event.confirm',
      [EventStatus.REQUEST],
      EventStatus.CONFIRMED,
      (event) => {
        const required = requiredDeposit(event.totalAmount, minDepositPercent);
        if (event.paidAmount.lt(required)) {
          throw AppException.conflict(
            'DEPOSIT_REQUIRED',
            'Bronni tasdiqlash uchun zaklad to‘lanishi kerak',
            {
              required: moneyString(required),
              paid: moneyString(event.paidAmount),
              percent: minDepositPercent,
            },
          );
        }
      },
    );
  }

  /** TASDIQLANGAN → O'TKAZILDI: tadbir boshlangan bo'lishi kerak. */
  hold(id: string) {
    return this.transition(id, 'event.hold', [EventStatus.CONFIRMED], EventStatus.HELD, (event) => {
      if (event.startAt.getTime() > Date.now()) {
        throw AppException.conflict('EVENT_NOT_STARTED', 'Tadbir hali boshlanmagan');
      }
    });
  }

  /** O'TKAZILDI → YAKUNLANDI: qarz qolmagan bo'lishi shart. */
  complete(id: string) {
    return this.transition(
      id,
      'event.complete',
      [EventStatus.HELD],
      EventStatus.COMPLETED,
      (event) => {
        const debt = event.totalAmount.sub(event.paidAmount);
        if (debt.gt(ZERO)) {
          throw AppException.conflict(
            'EVENT_HAS_DEBT',
            "Bronni yakunlash uchun qarz to'liq yopilishi kerak",
            {
              debt: moneyString(debt),
            },
          );
        }
      },
    );
  }

  cancel(id: string, reason: string) {
    return this.transition(
      id,
      'event.cancel',
      [EventStatus.REQUEST, EventStatus.CONFIRMED],
      EventStatus.CANCELLED,
      () => undefined,
      { cancelReason: reason, cancelledAt: new Date() },
    );
  }

  // ── To'lovlar ────────────────────────────────────────────────────────────

  async addPayment(id: string, dto: CreatePaymentDto, actor: AuthUser) {
    const amount = money(dto.amount);
    if (amount.isZero()) {
      throw AppException.badRequest('INVALID_AMOUNT', "Summa noldan katta bo'lishi kerak");
    }
    if (dto.currency === Currency.USD && !dto.exchangeRate) {
      throw AppException.badRequest('EXCHANGE_RATE_REQUIRED', 'Dollar uchun kursni kiriting');
    }
    const exchangeRate = dto.currency === Currency.UZS ? money(1) : money(dto.exchangeRate ?? '1');
    const amountUzs = toUzs(amount, exchangeRate);

    await this.prisma.$transaction(async (tx) => {
      const event = await this.lockEvent(tx, id);
      const isRefund = dto.kind === PaymentKind.REFUND;

      if (event.status === EventStatus.COMPLETED) {
        throw AppException.conflict('EVENT_CLOSED', "Yakunlangan bronga to'lov qo'shib bo'lmaydi");
      }
      if (event.status === EventStatus.CANCELLED && !isRefund) {
        throw AppException.conflict(
          'EVENT_CANCELLED',
          'Bekor qilingan bron uchun faqat pul qaytarish mumkin',
        );
      }
      if (isRefund && amountUzs.gt(event.paidAmount)) {
        throw AppException.conflict(
          'REFUND_EXCEEDS_PAID',
          "Qaytariladigan summa to'langandan ko'p",
          {
            paid: moneyString(event.paidAmount),
          },
        );
      }
      const debt = event.totalAmount.sub(event.paidAmount);
      if (!isRefund && amountUzs.gt(debt)) {
        throw AppException.conflict('PAYMENT_EXCEEDS_DEBT', "To'lov qolgan qarzdan ko'p", {
          debt: moneyString(debt),
        });
      }

      const payment = await tx.payment.create({
        data: {
          eventId: id,
          kind: dto.kind,
          method: dto.method,
          currency: dto.currency,
          amount,
          exchangeRate,
          amountUzs,
          paidAt: dto.paidAt,
          note: dto.note || null,
          createdById: actor.id,
        },
      });
      await this.recalculatePaid(tx, id);
      await this.audit.log(
        {
          action: isRefund ? 'payment.refund' : 'payment.create',
          resource: 'event',
          resourceId: id,
          after: {
            paymentId: payment.id,
            kind: payment.kind,
            method: payment.method,
            currency: payment.currency,
            amount: moneyString(amount),
            exchangeRate: exchangeRate.toString(),
            amountUzs: moneyString(amountUzs),
          },
        },
        tx,
      );
    });
    return this.findOne(id);
  }

  /** To'lov o'chirilmaydi — bekor qilingan deb belgilanadi va hisobdan chiqariladi. */
  async voidPayment(id: string, paymentId: string) {
    await this.prisma.$transaction(async (tx) => {
      const event = await this.lockEvent(tx, id);
      if (event.status === EventStatus.COMPLETED) {
        throw AppException.conflict(
          'EVENT_CLOSED',
          "Yakunlangan bron to'lovini bekor qilib bo'lmaydi",
        );
      }
      const payment = await tx.payment.findFirst({
        where: { id: paymentId, eventId: id, deletedAt: null },
      });
      if (!payment) throw AppException.notFound('PAYMENT_NOT_FOUND', "To'lov topilmadi");

      await tx.payment.update({ where: { id: paymentId }, data: { deletedAt: new Date() } });
      const paid = await this.recalculatePaid(tx, id);
      if (paid.isNegative()) {
        throw AppException.conflict(
          'PAYMENT_VOID_INVALID',
          "Bu to'lov bekor qilinsa, qaytarilgan summa to'langandan oshib ketadi",
        );
      }
      await this.audit.log(
        {
          action: 'payment.void',
          resource: 'event',
          resourceId: id,
          before: {
            paymentId,
            kind: payment.kind,
            amountUzs: moneyString(payment.amountUzs),
          },
        },
        tx,
      );
    });
    return this.findOne(id);
  }

  // ── Yordamchilar ─────────────────────────────────────────────────────────

  private async transition(
    id: string,
    action: string,
    from: EventStatus[],
    to: EventStatus,
    guard: (event: EventDetail) => void,
    extra: Prisma.EventUpdateInput = {},
  ) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockEvent(tx, id);
      const event = await this.findRecord(tx, id);
      if (!from.includes(event.status)) {
        throw AppException.conflict(
          'INVALID_STATUS_TRANSITION',
          "Bronning joriy holatida bu amalni bajarib bo'lmaydi",
          { status: event.status },
        );
      }
      guard(event);

      await tx.event.update({ where: { id }, data: { status: to, ...extra } });
      await this.audit.log(
        {
          action,
          resource: 'event',
          resourceId: id,
          before: { status: event.status },
          after: {
            status: to,
            ...('cancelReason' in extra && { cancelReason: extra.cancelReason }),
          },
        },
        tx,
      );
    });
    return this.findOne(id);
  }

  /** Bir bron ustida parallel to'lov va holat o'zgarishlari navbat bilan bajariladi. */
  private async lockEvent(tx: Tx, id: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM events WHERE id = ${id}::uuid AND deleted_at IS NULL FOR UPDATE`;
    if (rows.length === 0) throw notFound();
    return tx.event.findUniqueOrThrow({ where: { id } });
  }

  private async recalculatePaid(tx: Tx, eventId: string): Promise<Money> {
    const groups = await tx.payment.groupBy({
      by: ['kind'],
      where: { eventId, deletedAt: null },
      _sum: { amountUzs: true },
    });
    const paid = groups.reduce((sum, group) => {
      const value = group._sum.amountUzs ?? ZERO;
      return group.kind === PaymentKind.REFUND ? sum.sub(value) : sum.add(value);
    }, ZERO);

    if (!paid.isNegative()) {
      await tx.event.update({ where: { id: eventId }, data: { paidAmount: paid } });
    }
    return paid;
  }

  private async findRecord(client: Tx | PrismaService, id: string): Promise<EventDetail> {
    const event = await client.event.findFirst({
      where: { id, deletedAt: null },
      include: DETAIL_INCLUDE,
    });
    if (!event) throw notFound();
    return event;
  }

  private assertTimeRange(startAt: Date, endAt: Date): void {
    const duration = endAt.getTime() - startAt.getTime();
    if (duration <= 0 || duration > MAX_DURATION_MS) {
      throw AppException.badRequest(
        'INVALID_TIME_RANGE',
        "Tugash vaqti boshlanishdan keyin bo'lishi va tadbir 48 soatdan oshmasligi kerak",
      );
    }
  }

  private async assertClientExists(clientId: string): Promise<void> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, deletedAt: null },
      select: { id: true },
    });
    if (!client) throw AppException.badRequest('CLIENT_NOT_FOUND', 'Mijoz topilmadi');
  }

  private requirePrice(value: string | undefined): string {
    if (value === undefined) {
      throw AppException.badRequest('VALIDATION_ERROR', '1 kishilik narxni kiriting');
    }
    return value;
  }

  private packagePrice(menuPackage: { pricePerGuest: Money } | null): Money {
    if (!menuPackage) {
      throw AppException.badRequest(
        'MENU_PACKAGE_REQUIRED',
        'Menyu paketini tanlang — narx shu paketdan olinadi',
      );
    }
    return menuPackage.pricePerGuest;
  }

  private async loadMenuPackage(id: string) {
    const menuPackage = await this.prisma.menuPackage.findFirst({
      where: { id, deletedAt: null, isActive: true },
      select: { id: true, name: true, pricePerGuest: true },
    });
    if (!menuPackage) {
      throw AppException.badRequest(
        'MENU_PACKAGE_NOT_FOUND',
        "Menyu paketi topilmadi yoki o'chirib qo'yilgan",
      );
    }
    return menuPackage;
  }

  private async assertHallBookable(hallId: string, guestCount: number): Promise<void> {
    const hall = await this.prisma.hall.findFirst({ where: { id: hallId, deletedAt: null } });
    if (!hall) throw AppException.badRequest('HALL_NOT_FOUND', 'Zal topilmadi');
    if (hall.status !== HallStatus.ACTIVE) {
      throw AppException.conflict('HALL_UNAVAILABLE', "Zal ta'mirda — unga bron ochib bo'lmaydi");
    }
    this.checkCapacity(hall.capacity, guestCount);
  }

  private async assertCapacity(hallId: string, guestCount: number): Promise<void> {
    const hall = await this.prisma.hall.findUniqueOrThrow({
      where: { id: hallId },
      select: { capacity: true },
    });
    this.checkCapacity(hall.capacity, guestCount);
  }

  private checkCapacity(capacity: number, guestCount: number): void {
    if (guestCount > capacity) {
      throw AppException.badRequest(
        'GUEST_COUNT_EXCEEDS_CAPACITY',
        `Mehmonlar soni zal sig'imidan (${capacity}) oshib ketdi`,
        { capacity },
      );
    }
  }

  /** Foydalanuvchiga tushunarli xabar uchun oldindan tekshiruv (kafolat — bazadagi cheklovda). */
  private async assertHallFree(hallId: string, startAt: Date, endAt: Date, exceptId?: string) {
    const conflict = await this.prisma.event.findFirst({
      where: {
        hallId,
        deletedAt: null,
        status: { in: ACTIVE_STATUSES.concat(EventStatus.COMPLETED) },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        ...(exceptId && { id: { not: exceptId } }),
      },
      include: { client: { select: { fullName: true } } },
      orderBy: { startAt: 'asc' },
    });
    if (conflict) throw this.hallBusy(conflict);
  }

  private hallBusy(conflict?: {
    id: string;
    number: number;
    startAt: Date;
    endAt: Date;
    client: { fullName: string };
  }) {
    return AppException.conflict(
      'HALL_BUSY',
      'Bu vaqtda zal band',
      conflict && {
        eventId: conflict.id,
        number: conflict.number,
        startAt: conflict.startAt,
        endAt: conflict.endAt,
        clientName: conflict.client.fullName,
      },
    );
  }

  /** Poyga holatida oldindan tekshiruvdan o'tib ketgan to'qnashuvni baza ushlaydi. */
  private async guardOverlap<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isOverlapViolation(error)) throw this.hallBusy();
      throw error;
    }
  }

  /**
   * Xizmatlar ro'yxatini narxlari bilan yig'adi. Bronga avval qo'shilgan xizmat
   * o'sha paytdagi narxida qoladi; yangi qo'shilgani katalogdagi joriy narxni oladi.
   */
  private async buildServiceLines(
    requested: EventServiceItemDto[],
    existing: EventDetail['services'],
    guestCount: number,
  ): Promise<ServiceLine[]> {
    const snapshots = new Map(existing.map((service) => [service.extraServiceId, service]));
    const newIds = requested
      .map((item) => item.extraServiceId)
      .filter((serviceId) => !snapshots.has(serviceId));

    const catalog = newIds.length
      ? await this.prisma.extraService.findMany({
          where: { id: { in: newIds }, deletedAt: null, isActive: true },
        })
      : [];
    const catalogById = new Map(catalog.map((service) => [service.id, service]));

    return requested.map(({ extraServiceId, quantity }) => {
      const snapshot = snapshots.get(extraServiceId);
      const source = snapshot
        ? { name: snapshot.name, unit: snapshot.unit, unitPrice: snapshot.unitPrice }
        : catalogById.get(extraServiceId);
      if (!source) {
        throw AppException.badRequest(
          'EXTRA_SERVICE_NOT_FOUND',
          "Tanlangan xizmat topilmadi yoki o'chirib qo'yilgan",
        );
      }
      const unitPrice = 'unitPrice' in source ? source.unitPrice : source.price;
      const line = { unit: source.unit, unitPrice, quantity };
      return {
        extraServiceId,
        name: source.name,
        ...line,
        total: serviceTotal(line, guestCount),
      };
    });
  }

  private detailView(event: EventDetail, minDepositPercent: number) {
    const guestsTotal = event.pricePerGuest.mul(event.guestCount);
    const deposit = requiredDeposit(event.totalAmount, minDepositPercent);

    return {
      ...summaryView(event),
      pricePerGuest: moneyString(event.pricePerGuest),
      guestsTotal: moneyString(guestsTotal),
      extrasTotal: moneyString(event.extrasTotal),
      discount: moneyString(event.discount),
      /** Tasdiqlash uchun kerakli zaklad va uning foizi. */
      requiredDeposit: moneyString(deposit),
      minDepositPercent,
      note: event.note,
      cancelReason: event.cancelReason,
      services: event.services.map((service) => ({
        extraServiceId: service.extraServiceId,
        name: service.name,
        unit: service.unit,
        unitPrice: moneyString(service.unitPrice),
        quantity: service.quantity,
        total: moneyString(service.total),
      })),
      payments: event.payments.map((payment) => ({
        id: payment.id,
        kind: payment.kind,
        method: payment.method,
        currency: payment.currency,
        amount: moneyString(payment.amount),
        exchangeRate: payment.exchangeRate.toString(),
        amountUzs: moneyString(payment.amountUzs),
        paidAt: payment.paidAt,
        note: payment.note,
      })),
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };
  }
}
