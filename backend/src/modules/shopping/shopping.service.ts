import { Injectable } from '@nestjs/common';
import { EventStatus, Prisma, ShoppingListStatus, WarehouseSection } from '@prisma/client';
import { AppException } from '@/common/errors/app.exception';
import { SYSTEM_ROLES } from '@/common/permissions/permission-catalog';
import { AuthUser } from '@/common/types/auth-user';
import {
  addDays,
  diffDays,
  isValidDate,
  localDate,
  startOfLocalDay,
  toDbDate,
} from '@/common/utils/app-date.util';
import { ZERO, money, moneyString } from '@/common/utils/money.util';
import { parseQuantity, quantityString } from '@/common/utils/quantity.util';
import { AppConfigService } from '@/config/app-config.service';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { ensureSystemCategory } from '@/modules/finance/expense-categories';
import {
  KitchenEventsQueryDto,
  PurchaseDto,
  SaveShoppingListDto,
  ShoppingItemDto,
} from './dto/shopping.dto';

const MAX_SPAN_DAYS = 120;
const SUGGESTION_LIMIT = 300;

const LIST_INCLUDE = {
  items: { orderBy: { sortOrder: 'asc' } },
  event: {
    select: {
      id: true,
      number: true,
      title: true,
      type: true,
      startAt: true,
      guestCount: true,
      client: { select: { fullName: true } },
      hall: { select: { name: true } },
    },
  },
} satisfies Prisma.ShoppingListInclude;

export type ShoppingListRecord = Prisma.ShoppingListGetPayload<{ include: typeof LIST_INCLUDE }>;
type ItemRecord = ShoppingListRecord['items'][number];

const listTotal = (items: readonly ItemRecord[]): Prisma.Decimal =>
  items.reduce((sum, item) => (item.skipped || !item.price ? sum : sum.add(item.price)), ZERO);

const listView = (list: Omit<ShoppingListRecord, 'event'>) => ({
  id: list.id,
  eventId: list.eventId,
  status: list.status,
  note: list.note,
  createdById: list.createdById,
  createdByName: list.createdByName,
  createdAt: list.createdAt,
  approvedAt: list.approvedAt,
  purchasedAt: list.purchasedAt,
  purchasedByName: list.purchasedByName,
  confirmedAt: list.confirmedAt,
  total: moneyString(listTotal(list.items)),
  items: list.items.map((item) => ({
    id: item.id,
    name: item.name,
    unit: item.unit,
    quantity: quantityString(item.quantity),
    /** Oshpaz so'ragan miqdor — faqat keyin o'zgargan bo'lsa. */
    requestedQuantity:
      item.requestedQuantity && !item.requestedQuantity.eq(item.quantity)
        ? quantityString(item.requestedQuantity)
        : null,
    price: item.price ? moneyString(item.price) : null,
    skipped: item.skipped,
    note: item.note,
  })),
});

const auditFields = (list: Omit<ShoppingListRecord, 'event'>) => ({
  status: list.status,
  cook: list.createdByName,
  total: moneyString(listTotal(list.items)),
  items: list.items.map(
    (item) =>
      `${item.name} — ${quantityString(item.quantity)} ${item.unit}` +
      (item.skipped ? ' (olinmadi)' : item.price ? `: ${moneyString(item.price)}` : ''),
  ),
});

const notFound = () =>
  AppException.notFound('SHOPPING_LIST_NOT_FOUND', "Bozorlik ro'yxati topilmadi");
const wrongStatus = () =>
  AppException.conflict(
    'SHOPPING_LIST_WRONG_STATUS',
    "Ro'yxat holati o'zgargan — sahifani yangilang",
  );

const isSuperAdmin = (actor: AuthUser): boolean => actor.roleKey === SYSTEM_ROLES.SUPER_ADMIN;

/** Xaridchi (admin) ro'yxatni faqat SUPER_ADMIN ko'rib chiqib yuborgandan keyin ko'radi. */
const SENT_STATUSES: readonly ShoppingListStatus[] = [
  ShoppingListStatus.APPROVED,
  ShoppingListStatus.PURCHASED,
  ShoppingListStatus.CONFIRMED,
];
/** Shu holatdagi ro'yxat bo'lsa, to'yning bozorligi tugagan — yangi ro'yxat yozilmaydi. */
const DONE_STATUSES: readonly ShoppingListStatus[] = [
  ShoppingListStatus.PURCHASED,
  ShoppingListStatus.CONFIRMED,
];

/**
 * Xaridchi bitta mahsulotni bitta qatorda ko'rishi kerak: salat va birinchi ovqat
 * uchun yozilgan pomidor bitta jami bo'lib boradi. Nomi (harf kattaligidan qat'i
 * nazar) va birligi bir xil qatorlar qo'shiladi.
 */
export function mergeSameProduct<
  T extends { name: string; unit: string; quantity: string; note?: string | null },
>(items: readonly T[]): T[] {
  const merged = new Map<string, T>();
  for (const item of items) {
    const key = `${item.name.trim().toLowerCase()}|${item.unit}`;
    const previous = merged.get(key);
    merged.set(
      key,
      previous
        ? {
            ...previous,
            quantity: new Prisma.Decimal(previous.quantity).add(item.quantity).toString(),
            note: [previous.note, item.note].filter(Boolean).join('; ') || null,
          }
        : item,
    );
  }
  return [...merged.values()];
}

/**
 * Bozorlik oqimi:
 *   oshpaz yozadi (SUBMITTED) → SUPER_ADMIN tekshirib adminga yuboradi (APPROVED) →
 *   admin sotib olib narx kiritadi (PURCHASED) → SUPER_ADMIN tasdiqlaydi (CONFIRMED).
 * Faqat oxirgi qadamda summa xarajatlarga yoziladi va sof foydadan ayiriladi.
 */
@Injectable()
export class ShoppingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
  ) {}

  private get timeZone(): string {
    return this.config.app.timezone;
  }

  /**
   * Oshxona ko'rinishi: davrdagi tadbirlar (pulsiz), menyu tarkibi va bozorlik
   * ro'yxatlari. Bekor qilingan tadbir faqat ro'yxati bo'lsa ko'rsatiladi.
   */
  async listEvents(query: KitchenEventsQueryDto, actor: AuthUser) {
    if (
      !isValidDate(query.from) ||
      !isValidDate(query.to) ||
      query.from > query.to ||
      diffDays(query.from, query.to) > MAX_SPAN_DAYS
    ) {
      throw AppException.badRequest('INVALID_DATE_RANGE', "Davr noto'g'ri ko'rsatilgan");
    }

    const events = await this.prisma.event.findMany({
      where: {
        deletedAt: null,
        startAt: {
          gte: startOfLocalDay(query.from, this.timeZone),
          lt: startOfLocalDay(addDays(query.to, 1), this.timeZone),
        },
        OR: [
          { status: { not: EventStatus.CANCELLED } },
          { shoppingLists: { some: { deletedAt: null } } },
        ],
      },
      orderBy: { startAt: 'asc' },
      select: {
        id: true,
        number: true,
        title: true,
        type: true,
        status: true,
        startAt: true,
        endAt: true,
        guestCount: true,
        tableCapacity: true,
        firstDish: true,
        secondDish: true,
        menuPackageName: true,
        client: { select: { fullName: true } },
        hall: { select: { name: true } },
        menuPackage: {
          select: {
            deletedAt: true,
            sections: {
              select: {
                kindsCount: true,
                items: true,
                category: { select: { nameUz: true, nameRu: true, sortOrder: true } },
              },
            },
          },
        },
        shoppingLists: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          include: { items: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });

    const canPurchase = actor.permissions.includes('shopping:purchase');
    const canSee = (list: { createdById: string; status: ShoppingListStatus }): boolean =>
      isSuperAdmin(actor) ||
      list.createdById === actor.id ||
      (canPurchase && SENT_STATUSES.includes(list.status));

    return events.map((event) => ({
      id: event.id,
      number: event.number,
      title: event.title,
      type: event.type,
      status: event.status,
      startAt: event.startAt,
      endAt: event.endAt,
      /** Tadbir kuni (Toshkent) — xarid shu kundan boshlab kiritiladi. */
      day: localDate(event.startAt, this.timeZone),
      guestCount: event.guestCount,
      /** Stol turi va kelin-kuyov tanlagan ovqatlar — bozorlik shunga qarab rejalanadi. */
      tableCapacity: event.tableCapacity,
      firstDish: event.firstDish,
      secondDish: event.secondDish,
      clientName: event.client.fullName,
      hallName: event.hall.name,
      menu: event.menuPackageName
        ? {
            name: event.menuPackageName,
            sections:
              event.menuPackage && !event.menuPackage.deletedAt
                ? [...event.menuPackage.sections]
                    .sort((a, b) => a.category.sortOrder - b.category.sortOrder)
                    .map((section) => ({
                      nameUz: section.category.nameUz,
                      nameRu: section.category.nameRu,
                      kindsCount: section.kindsCount,
                      items: section.items,
                    }))
                : [],
          }
        : null,
      // Ro'yxat yozilishi bilan faqat SUPER_ADMIN ko'radi. Oshpaz o'zinikini, xaridchi
      // esa SUPER_ADMIN ko'rib chiqib yuborganlarini ko'radi.
      lists: event.shoppingLists.filter((list) => canSee(list)).map(listView),
      /** Bozorlik qilib bo'lingan — bu to'yga yangi ro'yxat yozilmaydi. */
      shoppingClosed: event.shoppingLists.some((list) => DONE_STATUSES.includes(list.status)),
      total: moneyString(
        event.shoppingLists
          .filter((list) => canSee(list))
          .reduce((sum, list) => sum.add(listTotal(list.items)), ZERO),
      ),
    }));
  }

  /** To'yga bog'lanmagan umumiy ro'yxatlar: tugallanmaganlari va oxirgi 60 kundagilari. */
  async listGeneral(actor: AuthUser) {
    const canPurchase = actor.permissions.includes('shopping:purchase');
    const lists = await this.prisma.shoppingList.findMany({
      where: {
        eventId: null,
        deletedAt: null,
        OR: [
          { status: { not: ShoppingListStatus.CONFIRMED } },
          { createdAt: { gte: new Date(Date.now() - 60 * 86_400_000) } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 60,
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    return lists
      .filter(
        (list) =>
          isSuperAdmin(actor) ||
          list.createdById === actor.id ||
          (canPurchase && SENT_STATUSES.includes(list.status)),
      )
      .map(listView);
  }

  /**
   * Kimdan nima kutilmoqda (qo'ng'iroqcha uchun): SUPER_ADMIN — tekshirish va
   * tasdiqlash kerak bo'lgan ro'yxatlar; xaridchi — unga yuborilgan, hali sotib
   * olinmaganlari.
   */
  async pending(actor: AuthUser) {
    const count = (status: ShoppingListStatus) =>
      this.prisma.shoppingList.count({ where: { deletedAt: null, status } });
    if (isSuperAdmin(actor)) {
      const [toReview, toConfirm] = await Promise.all([
        count(ShoppingListStatus.SUBMITTED),
        count(ShoppingListStatus.PURCHASED),
      ]);
      return { toReview, toConfirm, toPurchase: 0 };
    }
    const toPurchase = actor.permissions.includes('shopping:purchase')
      ? await count(ShoppingListStatus.APPROVED)
      : 0;
    return { toReview: 0, toConfirm: 0, toPurchase };
  }

  /**
   * Bozorlik yozishda taklif qilinadigan mahsulotlar: ombordagi oziq-ovqat katalogi
   * (nomi va birligi bilan) hamda ilgari ro'yxatlarda yozilgan nomlar.
   */
  async suggestions() {
    const [catalog, used] = await Promise.all([
      this.prisma.warehouseItem.findMany({
        where: { deletedAt: null, section: WarehouseSection.FOOD },
        select: { name: true, unit: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.shoppingItem.groupBy({
        by: ['name', 'unit'],
        where: { list: { deletedAt: null } },
        _count: { _all: true },
        orderBy: { _count: { name: 'desc' } },
        take: SUGGESTION_LIMIT,
      }),
    ]);
    const seen = new Set<string>();
    return [...catalog, ...used]
      .filter((row) => {
        const key = row.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((row) => ({ name: row.name, unit: row.unit }));
  }

  /** `eventId` bo'sh bo'lsa — to'yga bog'lanmagan umumiy bozorlik. */
  async create(eventId: string | null, dto: SaveShoppingListDto, actor: AuthUser) {
    if (eventId) {
      const event = await this.prisma.event.findFirst({
        where: { id: eventId, deletedAt: null },
        select: { id: true, status: true },
      });
      if (!event) throw AppException.notFound('EVENT_NOT_FOUND', 'Bron topilmadi');
      if (event.status === EventStatus.CANCELLED) {
        throw AppException.conflict(
          'EVENT_CANCELLED',
          'Bekor qilingan bron uchun bozorlik yozilmaydi',
        );
      }
      const done = await this.prisma.shoppingList.count({
        where: { eventId, deletedAt: null, status: { in: [...DONE_STATUSES] } },
      });
      if (done > 0) {
        throw AppException.conflict(
          'SHOPPING_CLOSED',
          "Bu to'yning bozorligi qilib bo'lingan — yangi ro'yxat yozib bo'lmaydi",
        );
      }
    }
    const items = this.buildItems(mergeSameProduct(dto.items));

    return this.prisma.$transaction(async (tx) => {
      const list = await tx.shoppingList.create({
        data: {
          eventId,
          note: dto.note || null,
          createdById: actor.id,
          createdByName: actor.fullName,
          items: {
            create: items.map(({ id: _id, ...item }, index) => ({
              ...item,
              requestedQuantity: item.quantity,
              sortOrder: index,
            })),
          },
        },
        include: LIST_INCLUDE,
      });
      await this.audit.log(
        {
          action: 'shopping.create',
          resource: 'shopping_list',
          resourceId: list.id,
          after: { event: list.event?.number ?? null, ...auditFields(list) },
        },
        tx,
      );
      return listView(list);
    });
  }

  /**
   * Ro'yxat mazmunini o'zgartirish — faqat tekshiruv bosqichida: oshpaz o'zinikini
   * tuzatadi, SUPER_ADMIN esa kamaytiradi, qo'shadi yoki olib tashlaydi (oshpaz
   * so'ragan miqdor farqni ko'rsatish uchun saqlanadi).
   */
  async update(id: string, dto: SaveShoppingListDto, actor: AuthUser) {
    const items = this.buildItems(dto.items);

    return this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, id);
      const reviewing = isSuperAdmin(actor);
      if (!reviewing && before.createdById !== actor.id) {
        throw AppException.forbidden('FORBIDDEN', "Faqat o'z ro'yxatingizni o'zgartira olasiz");
      }
      if (before.status !== ShoppingListStatus.SUBMITTED) {
        throw AppException.conflict(
          'SHOPPING_LIST_LOCKED',
          "Ro'yxat ko'rib chiqilgan — endi o'zgartirib bo'lmaydi",
        );
      }

      const existing = new Map(before.items.map((item) => [item.id, item]));
      const keptIds = new Set<string>();
      for (const [index, item] of items.entries()) {
        const current = item.id ? existing.get(item.id) : undefined;
        if (item.id && !current) {
          throw AppException.badRequest('SHOPPING_ITEM_NOT_FOUND', "Ro'yxatda bunday qator yo'q");
        }
        const data = {
          name: item.name,
          unit: item.unit,
          quantity: item.quantity,
          note: item.note,
          sortOrder: index,
        };
        if (current) {
          keptIds.add(current.id);
          await tx.shoppingItem.update({
            where: { id: current.id },
            data: {
              ...data,
              // Oshpazning o'zi tuzatsa — bu uning yangi so'rovi; birlik o'zgarsa eski
              // miqdor bilan solishtirishning ma'nosi qolmaydi.
              ...((!reviewing || current.unit !== item.unit) && {
                requestedQuantity: reviewing ? null : item.quantity,
              }),
            },
          });
        } else {
          await tx.shoppingItem.create({
            data: { ...data, listId: id, requestedQuantity: reviewing ? null : item.quantity },
          });
        }
      }
      await tx.shoppingItem.deleteMany({
        where: { listId: id, id: { notIn: [...keptIds], in: [...existing.keys()] } },
      });

      const list = await tx.shoppingList.update({
        where: { id },
        data: { note: dto.note === undefined ? before.note : dto.note || null },
        include: LIST_INCLUDE,
      });
      await this.audit.log(
        {
          action: 'shopping.update',
          resource: 'shopping_list',
          resourceId: id,
          before: auditFields(before),
          after: auditFields(list),
        },
        tx,
      );
      return listView(list);
    });
  }

  /** SUPER_ADMIN ko'rib chiqdi — ro'yxat xarid uchun adminga o'tadi. */
  approve(id: string) {
    return this.transition(id, 'shopping.approve', ShoppingListStatus.SUBMITTED, {
      status: ShoppingListStatus.APPROVED,
      approvedAt: new Date(),
    });
  }

  /**
   * Admin narxlarni kiritadi. `complete: false` — oraliq saqlash (bozorda yurganda),
   * `complete: true` — xarid tugadi: har bir qatorda narx bo'lishi yoki
   * "olinmadi" deb belgilanishi shart. Bozorlik tadbir kunidan oldin qilinmaydi.
   */
  async purchase(id: string, dto: PurchaseDto, actor: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, id);
      const fixing = before.status === ShoppingListStatus.PURCHASED && isSuperAdmin(actor);
      if (before.status !== ShoppingListStatus.APPROVED && !fixing) throw wrongStatus();

      // Umumiy bozorlik biror kunga bog'lanmagan — unda bu cheklov yo'q.
      const eventDay = before.event ? localDate(before.event.startAt, this.timeZone) : null;
      if (eventDay && localDate(new Date(), this.timeZone) < eventDay) {
        throw AppException.conflict(
          'SHOPPING_TOO_EARLY',
          'Bozorlik tadbir kuni qilinadi — narxlarni shu kundan boshlab kiritish mumkin',
          { day: eventDay },
        );
      }

      const existing = new Map(before.items.map((item) => [item.id, item]));
      const seen = new Set<string>();
      for (const input of dto.items) {
        const current = existing.get(input.id);
        if (!current || seen.has(input.id)) {
          throw AppException.badRequest('SHOPPING_ITEM_NOT_FOUND', "Ro'yxatda bunday qator yo'q");
        }
        seen.add(input.id);
        const skipped = input.skipped === true;
        const price = !skipped && input.price ? money(input.price) : null;
        if (price?.isZero()) {
          throw AppException.badRequest('INVALID_AMOUNT', "Summa noldan katta bo'lishi kerak");
        }
        await tx.shoppingItem.update({
          where: { id: current.id },
          data: { quantity: parseQuantity(input.quantity, current.unit), price, skipped },
        });
      }

      const complete = dto.complete || fixing;
      if (complete) {
        const items = await tx.shoppingItem.findMany({ where: { listId: id } });
        const missing = items.filter((item) => !item.skipped && !item.price);
        if (missing.length > 0) {
          throw AppException.badRequest(
            'SHOPPING_PRICES_MISSING',
            'Har bir mahsulot narxini kiriting yoki "olinmadi" deb belgilang',
            { items: missing.map((item) => item.name) },
          );
        }
        if (items.every((item) => item.skipped)) {
          throw AppException.badRequest(
            'SHOPPING_NOTHING_PURCHASED',
            'Hech narsa sotib olinmagan — kamida bitta mahsulot narxini kiriting',
          );
        }
      }

      const list = await tx.shoppingList.update({
        where: { id },
        data:
          complete && !fixing
            ? {
                status: ShoppingListStatus.PURCHASED,
                purchasedAt: new Date(),
                purchasedByName: actor.fullName,
              }
            : {},
        include: LIST_INCLUDE,
      });
      if (complete) {
        await this.audit.log(
          {
            action: fixing ? 'shopping.prices_update' : 'shopping.purchase',
            resource: 'shopping_list',
            resourceId: id,
            before: auditFields(before),
            after: auditFields(list),
          },
          tx,
        );
      }
      return listView(list);
    });
  }

  /**
   * SUPER_ADMIN tasdiqlaydi: shu lahzadan boshlab summa xarajat hisoblanadi va
   * sof foydadan ayiriladi. Xarajat tadbir kuniga yoziladi (bozorlik shu kuni qilinadi).
   */
  async confirm(id: string, actor: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, id);
      if (before.status !== ShoppingListStatus.PURCHASED) throw wrongStatus();
      const total = listTotal(before.items);

      const category = await ensureSystemCategory(tx, 'SHOPPING');
      await tx.expense.create({
        data: {
          categoryId: category.id,
          amount: total,
          // To'y bozorligi to'y kuniga, umumiy bozorlik esa tasdiqlangan kunga yoziladi.
          spentOn: toDbDate(localDate(before.event?.startAt ?? new Date(), this.timeZone)),
          note: before.event
            ? `Bron № ${before.event.number} — ${before.event.title ?? before.event.client.fullName} (${before.createdByName})`
            : `Umumiy bozorlik (${before.createdByName})`,
          shoppingListId: id,
          eventId: before.eventId,
          createdById: actor.id,
          createdByName: actor.fullName,
        },
      });
      const list = await tx.shoppingList.update({
        where: { id },
        data: { status: ShoppingListStatus.CONFIRMED, confirmedAt: new Date() },
        include: LIST_INCLUDE,
      });
      await this.audit.log(
        {
          action: 'shopping.confirm',
          resource: 'shopping_list',
          resourceId: id,
          before: { status: before.status },
          after: { status: list.status, expense: moneyString(total) },
        },
        tx,
      );
      return listView(list);
    });
  }

  /** Tasdiqni bekor qilish: xarajat hisobdan chiqadi, ro'yxat narxlarni tuzatish uchun ochiladi. */
  async unconfirm(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, id);
      if (before.status !== ShoppingListStatus.CONFIRMED) throw wrongStatus();

      await tx.expense.updateMany({
        where: { shoppingListId: id },
        data: { deletedAt: new Date(), shoppingListId: null },
      });
      const list = await tx.shoppingList.update({
        where: { id },
        data: { status: ShoppingListStatus.PURCHASED, confirmedAt: null },
        include: LIST_INCLUDE,
      });
      await this.audit.log(
        {
          action: 'shopping.unconfirm',
          resource: 'shopping_list',
          resourceId: id,
          before: { status: before.status, expense: moneyString(listTotal(before.items)) },
          after: { status: list.status },
        },
        tx,
      );
      return listView(list);
    });
  }

  /** Oshpaz o'z ro'yxatini tekshiruvgacha, SUPER_ADMIN esa tasdiqlanmaganini o'chira oladi. */
  async remove(id: string, actor: AuthUser): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const list = await this.lock(tx, id);
      if (isSuperAdmin(actor)) {
        if (list.status === ShoppingListStatus.CONFIRMED) {
          throw AppException.conflict(
            'SHOPPING_LIST_LOCKED',
            "Tasdiqlangan ro'yxat o'chirilmaydi — avval tasdiqni bekor qiling",
          );
        }
      } else if (list.createdById !== actor.id) {
        throw AppException.forbidden('FORBIDDEN', "Faqat o'z ro'yxatingizni o'chira olasiz");
      } else if (list.status !== ShoppingListStatus.SUBMITTED) {
        throw AppException.conflict(
          'SHOPPING_LIST_LOCKED',
          "Ro'yxat ko'rib chiqilgan — endi o'chirib bo'lmaydi",
        );
      }

      await tx.shoppingList.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.log(
        {
          action: 'shopping.delete',
          resource: 'shopping_list',
          resourceId: id,
          before: { event: list.event?.number ?? null, ...auditFields(list) },
        },
        tx,
      );
    });
  }

  /** PDF uchun to'liq yozuv. */
  async findForDocument(id: string): Promise<ShoppingListRecord> {
    const list = await this.prisma.shoppingList.findFirst({
      where: { id, deletedAt: null },
      include: LIST_INCLUDE,
    });
    if (!list) throw notFound();
    return list;
  }

  // ── Yordamchi ────────────────────────────────────────────────────────────

  private async transition(
    id: string,
    action: string,
    from: ShoppingListStatus,
    data: Prisma.ShoppingListUpdateInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, id);
      if (before.status !== from) throw wrongStatus();
      const list = await tx.shoppingList.update({ where: { id }, data, include: LIST_INCLUDE });
      await this.audit.log(
        {
          action,
          resource: 'shopping_list',
          resourceId: id,
          before: { status: before.status },
          after: { status: list.status },
        },
        tx,
      );
      return listView(list);
    });
  }

  /** Qatorni qulflab o'qiydi — bir vaqtda kelgan ikki tasdiq ikki xarajat yozmasin. */
  private async lock(tx: Prisma.TransactionClient, id: string): Promise<ShoppingListRecord> {
    await tx.$queryRaw`SELECT id FROM shopping_lists WHERE id = ${id}::uuid FOR UPDATE`;
    const list = await tx.shoppingList.findFirst({
      where: { id, deletedAt: null },
      include: LIST_INCLUDE,
    });
    if (!list) throw notFound();
    return list;
  }

  private buildItems(items: readonly ShoppingItemDto[]) {
    const names = new Set<string>();
    return items.map((item) => {
      const key = `${item.name.toLowerCase()}|${item.unit}`;
      if (names.has(key)) {
        throw AppException.badRequest(
          'SHOPPING_ITEM_DUPLICATE',
          `"${item.name}" ro'yxatda ikki marta yozilgan`,
          { name: item.name },
        );
      }
      names.add(key);
      return {
        id: item.id,
        name: item.name,
        unit: item.unit,
        quantity: parseQuantity(item.quantity, item.unit),
        note: item.note || null,
      };
    });
  }
}
