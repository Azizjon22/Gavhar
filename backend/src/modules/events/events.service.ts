import { Injectable } from '@nestjs/common';
import { EventStatus, HallStatus, PaymentKind, Prisma } from '@prisma/client';
import { Paginated } from '@/common/dto/pagination.dto';
import { AppException } from '@/common/errors/app.exception';
import { AuthUser } from '@/common/types/auth-user';
import { localDate, toDbDate } from '@/common/utils/app-date.util';
import { Money, ZERO, money, moneyString } from '@/common/utils/money.util';
import { AppConfigService } from '@/config/app-config.service';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import {
  CalendarQueryDto,
  CreateEventDto,
  CreatePaymentDto,
  ListEventsDto,
  UpdateEventDto,
} from './dto/event.dto';

const SUMMARY_INCLUDE = {
  client: { select: { id: true, fullName: true, phone: true } },
  hall: { select: { id: true, name: true } },
} satisfies Prisma.EventInclude;

const DETAIL_INCLUDE = {
  ...SUMMARY_INCLUDE,
  payments: { where: { deletedAt: null }, orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }] },
} satisfies Prisma.EventInclude;

type EventSummary = Prisma.EventGetPayload<{ include: typeof SUMMARY_INCLUDE }>;
export type EventDetail = Prisma.EventGetPayload<{ include: typeof DETAIL_INCLUDE }>;

type Tx = Prisma.TransactionClient;

/** Vaqtni band qilib turadigan holatlar. */
const ACTIVE_STATUSES: EventStatus[] = [EventStatus.REQUEST, EventStatus.CONFIRMED];
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
  totalAmount: moneyString(event.totalAmount),
  note: event.note,
});

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
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
    return this.detailView(await this.findRecord(this.prisma, id));
  }

  /** PDF va boshqa ichki ehtiyojlar uchun xom yozuv. */
  findDetail(id: string): Promise<EventDetail> {
    return this.findRecord(this.prisma, id);
  }

  // ── Yaratish va tahrirlash ───────────────────────────────────────────────

  /**
   * Narx tanlangan menyu paketidan olinadi va bronda qotib qoladi: keyin paket narxi
   * yoki mehmonlar soni o'zgarsa ham bron summasi o'zgarmaydi.
   */
  async create(dto: CreateEventDto) {
    this.assertTimeRange(dto.startAt, dto.endAt);
    this.assertNotPast(dto.startAt);
    await this.assertClientExists(dto.clientId);
    await this.assertHallBookable(dto.hallId, dto.guestCount);
    const menuPackage = await this.loadMenuPackage(dto.menuPackageId);
    await this.assertHallFree(dto.hallId, dto.startAt, dto.endAt);

    const event = await this.guardOverlap(() =>
      this.prisma.$transaction(async (tx) => {
        const created = await tx.event.create({
          data: {
            clientId: dto.clientId,
            hallId: dto.hallId,
            menuPackageId: menuPackage.id,
            menuPackageName: menuPackage.name,
            type: dto.type,
            title: dto.title || null,
            startAt: dto.startAt,
            endAt: dto.endAt,
            guestCount: dto.guestCount,
            tableCapacity: dto.tableCapacity ?? null,
            firstDish: dto.firstDish || null,
            secondDish: dto.secondDish || null,
            totalAmount: menuPackage.price,
            note: dto.note || null,
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
    return this.detailView(event);
  }

  async update(id: string, dto: UpdateEventDto) {
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

    this.assertTimeRange(startAt, endAt);
    if (dto.clientId && dto.clientId !== before.clientId)
      await this.assertClientExists(dto.clientId);

    if (hallId !== before.hallId) {
      await this.assertHallBookable(hallId, guestCount);
    } else if (guestCount !== before.guestCount) {
      await this.assertCapacity(hallId, guestCount);
    }

    // Faqat boshqa paketga o'tilganda narx o'sha paketdan qayta olinadi; mehmonlar
    // soni o'zgarishi narxga ta'sir qilmaydi. Olingan pul yangi narxdan oshmasligi kerak.
    let repriced: { menuPackageId: string; menuPackageName: string; totalAmount: Money } | null =
      null;
    if (dto.menuPackageId !== undefined && dto.menuPackageId !== before.menuPackageId) {
      const selected = await this.loadMenuPackage(dto.menuPackageId);
      if (selected.price.lt(before.paidAmount)) {
        throw AppException.conflict(
          'TOTAL_BELOW_PAID',
          "Bu paket narxi allaqachon to'langan summadan kam — avval ortiqcha pulni qaytaring",
          {
            paidAmount: moneyString(before.paidAmount),
            totalAmount: moneyString(selected.price),
          },
        );
      }
      repriced = {
        menuPackageId: selected.id,
        menuPackageName: selected.name,
        totalAmount: selected.price,
      };
    }
    if (scheduleChanged) await this.assertHallFree(hallId, startAt, endAt, id);

    const event = await this.guardOverlap(() =>
      this.prisma.$transaction(async (tx) => {
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
            ...repriced,
            hallId,
            startAt,
            endAt,
            guestCount,
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
    return this.detailView(event);
  }

  /**
   * Tasdiqlangan, yakunlangan yoki puli/xarajati bor bron hisobda qoladi — uni o'chirib
   * bo'lmaydi, faqat bekor qilinadi. Bekor qilingan to'lov ham tarix sifatida hisoblanadi.
   */
  async remove(id: string): Promise<void> {
    const event = await this.findRecord(this.prisma, id);
    if (event.status === EventStatus.CONFIRMED || event.status === EventStatus.COMPLETED) {
      throw AppException.conflict(
        'EVENT_DELETE_FORBIDDEN',
        "Tasdiqlangan yoki yakunlangan bronni o'chirib bo'lmaydi — kerak bo'lsa bekor qiling",
      );
    }
    const [payments, expenses, stockUsages] = await Promise.all([
      this.prisma.payment.count({ where: { eventId: id } }),
      this.prisma.expense.count({ where: { eventId: id, deletedAt: null } }),
      this.prisma.stockUsage.count({ where: { eventId: id } }),
    ]);
    if (stockUsages > 0) {
      throw AppException.conflict(
        'EVENT_HAS_STOCK',
        "Bu to'yga ombordan mahsulot olingan — uni o'chirib bo'lmaydi, kerak bo'lsa bekor qiling",
      );
    }
    if (payments > 0 || expenses > 0) {
      throw AppException.conflict(
        'EVENT_HAS_MONEY',
        "Bu bronga to'lov yoki xarajat yozilgan — uni o'chirib bo'lmaydi, kerak bo'lsa bekor qiling",
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

  /** KUTILMOQDA → TASDIQLANGAN qo'lda. To'liq to'langan bron o'zi tasdiqlanadi. */
  confirm(id: string) {
    return this.transition(
      id,
      'event.confirm',
      [EventStatus.REQUEST],
      EventStatus.CONFIRMED,
      () => undefined,
    );
  }

  /**
   * Yakunlangan — to'y kuni kelgan. Oldindan yakunlab bo'lmaydi. Qarz qolishi mumkin:
   * u qarzdor to'ylar ro'yxatida turadi va to'lovlar qabul qilinaveradi.
   */
  complete(id: string) {
    return this.transition(
      id,
      'event.complete',
      [EventStatus.REQUEST, EventStatus.CONFIRMED],
      EventStatus.COMPLETED,
      (event) => {
        if (this.dayOf(event.startAt) > this.dayOf(new Date())) {
          throw AppException.conflict(
            'EVENT_NOT_STARTED',
            "Kelajakdagi to'yni yakunlangan deb belgilab bo'lmaydi",
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

  /**
   * Xato bilan bekor qilingan yoki yakunlangan bronni qaytarish: bekor qilingan —
   * "Kutilmoqda"ga (vaqti bo'sh bo'lsa), yakunlangan — "Tasdiqlangan"ga.
   */
  async reopen(id: string) {
    const event = await this.findRecord(this.prisma, id);
    if (event.status === EventStatus.CANCELLED) {
      await this.assertHallFree(event.hallId, event.startAt, event.endAt, id);
      return this.guardOverlap(() =>
        this.transition(
          id,
          'event.reopen',
          [EventStatus.CANCELLED],
          EventStatus.REQUEST,
          () => undefined,
          { cancelReason: null, cancelledAt: null },
        ),
      );
    }
    return this.transition(
      id,
      'event.reopen',
      [EventStatus.COMPLETED],
      EventStatus.CONFIRMED,
      () => undefined,
    );
  }

  // ── To'lovlar ────────────────────────────────────────────────────────────

  /**
   * To'lov qarzdan, qaytarish olingan puldan oshmaydi (bir vaqtda kiritilganlar navbat
   * bilan tekshiriladi). Kutilayotgan bron to'liq to'langanda o'zi tasdiqlanadi.
   */
  async addPayment(id: string, dto: CreatePaymentDto, actor: AuthUser) {
    const amount = money(dto.amount);
    if (amount.isZero()) {
      throw AppException.badRequest('INVALID_AMOUNT', "Summa noldan katta bo'lishi kerak");
    }

    await this.prisma.$transaction(async (tx) => {
      const event = await this.lockEvent(tx, id);
      const isRefund = dto.kind === PaymentKind.REFUND;

      if (event.status === EventStatus.CANCELLED && !isRefund) {
        throw AppException.conflict(
          'EVENT_CANCELLED',
          "Bekor qilingan to'yga to'lov qabul qilinmaydi — faqat pul qaytarish mumkin",
        );
      }
      if (isRefund && amount.gt(event.paidAmount)) {
        throw AppException.conflict(
          'REFUND_EXCEEDS_PAID',
          "Olingan puldan ko'p qaytarib bo'lmaydi",
          { paid: moneyString(event.paidAmount) },
        );
      }
      const debt = event.totalAmount.sub(event.paidAmount);
      if (!isRefund && amount.gt(debt)) {
        throw AppException.conflict(
          debt.gt(ZERO) ? 'PAYMENT_EXCEEDS_DEBT' : 'EVENT_FULLY_PAID',
          debt.gt(ZERO)
            ? "To'lov qolgan qarzdan ko'p"
            : "Bu to'y to'liq to'langan — yangi to'lov qabul qilinmaydi",
          { debt: moneyString(debt.isNegative() ? ZERO : debt) },
        );
      }

      const payment = await tx.payment.create({
        data: {
          eventId: id,
          kind: dto.kind,
          method: dto.method,
          amount,
          paidAt: dto.paidAt,
          note: dto.note || null,
          createdById: actor.id,
        },
      });
      const paid = await this.recalculatePaid(tx, id);
      await this.audit.log(
        {
          action: isRefund ? 'payment.refund' : 'payment.create',
          resource: 'event',
          resourceId: id,
          after: {
            paymentId: payment.id,
            kind: payment.kind,
            method: payment.method,
            amount: moneyString(amount),
          },
        },
        tx,
      );

      // To'liq to'landi: bron o'zi tasdiqlanadi (va endi o'chirib bo'lmaydi).
      if (!isRefund && event.status === EventStatus.REQUEST && paid.gte(event.totalAmount)) {
        await tx.event.update({ where: { id }, data: { status: EventStatus.CONFIRMED } });
        await this.audit.log(
          {
            action: 'event.auto_confirm',
            resource: 'event',
            resourceId: id,
            before: { status: EventStatus.REQUEST },
            after: { status: EventStatus.CONFIRMED },
          },
          tx,
        );
      }
    });
    return this.findOne(id);
  }

  /** To'lov o'chirilmaydi — bekor qilingan deb belgilanadi va hisobdan chiqariladi. */
  async voidPayment(id: string, paymentId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockEvent(tx, id);
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
            amount: moneyString(payment.amount),
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
      _sum: { amount: true },
    });
    const paid = groups.reduce((sum, group) => {
      const value = group._sum.amount ?? ZERO;
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

  /** To'y kuni (Toshkent vaqti bilan) "YYYY-MM-DD". */
  private dayOf(instant: Date): string {
    return localDate(instant, this.config.app.timezone);
  }

  /** O'tib ketgan kunga to'y yozib bo'lmaydi (bugungi kunga — mumkin). */
  private assertNotPast(startAt: Date): void {
    if (this.dayOf(startAt) < this.dayOf(new Date())) {
      throw AppException.badRequest('EVENT_DATE_PAST', "O'tib ketgan sanaga to'y yozib bo'lmaydi");
    }
  }

  /** To'y narxi shu paketdan olinadi: paket majburiy, faol bo'lishi kerak. */
  private async loadMenuPackage(id: string | null | undefined) {
    if (!id) {
      throw AppException.badRequest(
        'MENU_PACKAGE_REQUIRED',
        'Menyu paketini tanlang — narx shu paketdan olinadi',
      );
    }
    const menuPackage = await this.prisma.menuPackage.findFirst({
      where: { id, deletedAt: null, isActive: true },
      select: { id: true, name: true, price: true },
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

  private detailView(event: EventDetail) {
    const sumOf = (kind: PaymentKind) =>
      event.payments
        .filter((payment) => payment.kind === kind)
        .reduce((sum, payment) => sum.add(payment.amount), ZERO);

    return {
      ...summaryView(event),
      /** Olingan pul va mijozga qaytarilgani (bekor qilinmagan to'lovlar). */
      receivedAmount: moneyString(sumOf(PaymentKind.PAYMENT)),
      refundedAmount: moneyString(sumOf(PaymentKind.REFUND)),
      note: event.note,
      cancelReason: event.cancelReason,
      payments: event.payments.map((payment) => ({
        id: payment.id,
        kind: payment.kind,
        method: payment.method,
        amount: moneyString(payment.amount),
        paidAt: payment.paidAt,
        note: payment.note,
      })),
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };
  }
}
