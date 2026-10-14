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
import { PhotoService } from '@/infrastructure/storage/photo.service';
import { TelegramService } from '@/modules/telegram/telegram.service';
import { defaultPhoto, defaultProduct, productKey } from './default-catalog';
import { DEFAULT_PRODUCTS } from './default-products';
import { AuditService } from '@/modules/audit/audit.service';
import { ensureSystemCategory } from '@/modules/finance/expense-categories';
import {
  FixItemPriceDto,
  KitchenEventsQueryDto,
  PurchaseItemDto,
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

/** Sotib olingan yoki "olinmadi" deb belgilangan qator — endi o'zgartirilmaydi. */
const isDone = (item: ItemRecord): boolean => item.skipped || item.price !== null;

const listView = (list: Omit<ShoppingListRecord, 'event'>) => ({
  id: list.id,
  eventId: list.eventId,
  status: list.status,
  note: list.note,
  createdById: list.createdById,
  createdByName: list.createdByName,
  createdAt: list.createdAt,
  reviewedAt: list.reviewedAt,
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
    /** Shu qator uchun to'langan aniq jami; bo'sh — hali sotib olinmagan. */
    price: item.price ? moneyString(item.price) : null,
    /** Faqat ko'rsatish uchun: jami ÷ miqdor. */
    unitPrice:
      item.price && !item.quantity.isZero()
        ? moneyString(item.price.div(item.quantity).toDecimalPlaces(2))
        : null,
    purchasedAt: item.purchasedAt,
    purchasedByName: item.purchasedByName,
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
/** Hali adminga yuborilmagan — SUPER_ADMIN tekshirmoqda. */
const NOT_SENT_STATUSES: readonly ShoppingListStatus[] = [
  ShoppingListStatus.SUBMITTED,
  ShoppingListStatus.REVIEWED,
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
 * Bozorlik oqimi (Shodiyora):
 *   oshpaz yozadi (SUBMITTED) → SUPER_ADMIN sahifani ochadi (REVIEWED), kerak bo'lsa
 *   tuzatadi va adminga yuboradi (APPROVED) → har bir mahsulot alohida sotib olinadi,
 *   hammasi olingach ro'yxat PURCHASED bo'ladi → SUPER_ADMIN tasdiqlab yopadi (CONFIRMED).
 * SUPER_ADMIN yangi ro'yxatdan to'g'ridan-to'g'ri o'zi ham xarid qila oladi. Faqat
 * oxirgi qadamda summa xarajatlarga yoziladi va sof foydadan ayiriladi.
 */
@Injectable()
export class ShoppingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
    private readonly photos: PhotoService,
    private readonly telegram: TelegramService,
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
                category: {
                  select: { nameUz: true, nameRu: true, course: true, sortOrder: true },
                },
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
                      /** Oshxona bosqichi — oshpaz ro'yxatni taom bo'yicha yozadi. */
                      course: section.category.course,
                      kindsCount: section.kindsCount,
                      items: section.items,
                    }))
                : [],
          }
        : null,
      // Ro'yxat yozilishi bilan faqat SUPER_ADMIN ko'radi. Oshpaz o'zinikini, xaridchi
      // esa SUPER_ADMIN ko'rib chiqib yuborganlarini ko'radi.
      lists: event.shoppingLists.filter((list) => canSee(list)).map(listView),
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
   * Kimdan nima kutilmoqda: SUPER_ADMIN — tekshirish va tasdiqlash kerak bo'lgan
   * ro'yxatlar; xaridchi — unga yuborilgan, hali sotib olinmaganlari. `unseen` —
   * qo'ng'iroqcha uchun: SUPER_ADMIN hali ochmagan yangi ro'yxatlar, xaridchi esa
   * yuborilganidan keyin bozorlik sahifasini hali ochmaganlari.
   */
  async pending(actor: AuthUser) {
    const count = (where: Prisma.ShoppingListWhereInput) =>
      this.prisma.shoppingList.count({ where: { deletedAt: null, ...where } });
    if (isSuperAdmin(actor)) {
      const [unseen, toReview, toConfirm] = await Promise.all([
        count({ status: ShoppingListStatus.SUBMITTED }),
        count({ status: { in: [...NOT_SENT_STATUSES] } }),
        count({ status: ShoppingListStatus.PURCHASED }),
      ]);
      return { unseen, toReview, toConfirm, toPurchase: 0 };
    }
    if (!actor.permissions.includes('shopping:purchase')) {
      return { unseen: 0, toReview: 0, toConfirm: 0, toPurchase: 0 };
    }
    const [unseen, toPurchase] = await Promise.all([
      count({ status: ShoppingListStatus.APPROVED, adminSeenAt: null }),
      count({ status: ShoppingListStatus.APPROVED }),
    ]);
    return { unseen, toReview: 0, toConfirm: 0, toPurchase };
  }

  /**
   * Bozorlik sahifasi ochildi: SUPER_ADMIN uchun yangi ro'yxatlar "ko'rildi" bo'ladi,
   * xaridchi uchun — unga yuborilganlar. Qo'ng'iroqcha keyingi yuklashda o'chadi.
   */
  async markSeen(actor: AuthUser): Promise<void> {
    const now = new Date();
    if (isSuperAdmin(actor)) {
      await this.prisma.shoppingList.updateMany({
        where: { deletedAt: null, status: ShoppingListStatus.SUBMITTED },
        data: { status: ShoppingListStatus.REVIEWED, reviewedAt: now },
      });
    } else if (actor.permissions.includes('shopping:purchase')) {
      await this.prisma.shoppingList.updateMany({
        where: { deletedAt: null, status: ShoppingListStatus.APPROVED, adminSeenAt: null },
        data: { adminSeenAt: now },
      });
    }
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

  /**
   * Oshpaz uchun mahsulot katalogi: ombordagi oziq-ovqat, ilgari yozilgan mahsulotlar va
   * standart to'y oshxonasi ro'yxati (omborda yo'q bo'lsa ham). Rasm: mahsulotning o'zi
   * yuklagani, bo'lmasa nomiga mos standart rasm. Narx ham, qoldiq ham qaytarilmaydi.
   */
  async catalog() {
    const [items, used] = await Promise.all([
      this.prisma.warehouseItem.findMany({
        where: { deletedAt: null, section: WarehouseSection.FOOD },
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
    const known = new Set(items.map((item) => productKey(item.name)));
    const fresh = (name: string) => {
      const key = productKey(name);
      if (known.has(key)) return false;
      known.add(key);
      return true;
    };
    const fromStock = await Promise.all(
      items.map(async (item) => ({
        name: item.name,
        unit: item.unit,
        productCategory: item.productCategory ?? defaultProduct(item.name)?.productCategory ?? null,
        photo:
          (await this.photos.urls(item.photoKey, item.photoThumbKey)) ?? defaultPhoto(item.name),
      })),
    );
    const written = used
      .filter((row) => fresh(row.name))
      .map((row) => ({
        name: row.name,
        unit: row.unit,
        productCategory: defaultProduct(row.name)?.productCategory ?? null,
        photo: defaultPhoto(row.name),
      }));
    const standard = DEFAULT_PRODUCTS.filter((product) => fresh(product.name)).map((product) => ({
      name: product.name,
      unit: product.unit,
      productCategory: product.productCategory,
      photo: defaultPhoto(product.name),
    }));
    return [...fromStock, ...written, ...standard];
  }

  /**
   * Foydalanuvchining o'zi yozgan ro'yxatlari (oxirgi 30 tasi) — holati bilan; to'y
   * mehmonlari soni oldingi ro'yxatdan nusxa olishda miqdorni moslash uchun kerak.
   */
  async mine(actor: AuthUser) {
    const lists = await this.prisma.shoppingList.findMany({
      where: { deletedAt: null, createdById: actor.id },
      include: {
        ...LIST_INCLUDE,
        event: {
          select: {
            id: true,
            number: true,
            title: true,
            startAt: true,
            guestCount: true,
            client: { select: { fullName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return lists.map((list) => ({
      ...listView(list),
      event: list.event
        ? {
            id: list.event.id,
            number: list.event.number,
            title: list.event.title,
            clientName: list.event.client.fullName,
            startAt: list.event.startAt,
            guestCount: list.event.guestCount,
          }
        : null,
    }));
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
    }
    const items = this.buildItems(mergeSameProduct(dto.items));

    const view = await this.prisma.$transaction(async (tx) => {
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
    void this.telegram.notifyListSubmitted(view.id);
    return view;
  }

  /**
   * Ro'yxat mazmunini o'zgartirish. Oshpaz o'zinikini SUPER_ADMIN ko'rmasidan oldin
   * tuzatadi; SUPER_ADMIN esa xarid tugaguncha kamaytiradi, qo'shadi yoki olib tashlaydi
   * (oshpaz so'ragan miqdor farqni ko'rsatish uchun saqlanadi). Sotib olingan yoki
   * "olinmadi" deb belgilangan qatorlar qulflangan — yuborilmasa ham o'chmaydi.
   */
  async update(id: string, dto: SaveShoppingListDto, actor: AuthUser) {
    const items = this.buildItems(dto.items);

    const result = await this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, id);
      const reviewing = isSuperAdmin(actor);
      if (!reviewing && before.createdById !== actor.id) {
        throw AppException.forbidden('FORBIDDEN', "Faqat o'z ro'yxatingizni o'zgartira olasiz");
      }
      const editable: readonly ShoppingListStatus[] = reviewing
        ? [...NOT_SENT_STATUSES, ShoppingListStatus.APPROVED]
        : [ShoppingListStatus.SUBMITTED];
      if (!editable.includes(before.status)) {
        throw AppException.conflict(
          'SHOPPING_LIST_LOCKED',
          reviewing
            ? "Xarid qilingan yoki yopilgan ro'yxatni o'zgartirib bo'lmaydi"
            : "Ro'yxat ko'rib chiqilgan — endi o'zgartirib bo'lmaydi",
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
        if (current && isDone(current)) {
          const unchanged =
            current.name === item.name &&
            current.unit === item.unit &&
            current.quantity.eq(item.quantity);
          if (!unchanged) {
            throw AppException.conflict(
              'SHOPPING_ITEM_LOCKED',
              `"${current.name}" sotib olingan — uni o'zgartirib bo'lmaydi`,
              { name: current.name },
            );
          }
          keptIds.add(current.id);
          continue;
        }
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
      // Sotib olinganlari tegilmaydi; qolganidan yuborilmaganlari olib tashlanadi.
      const removable = before.items
        .filter((item) => !isDone(item) && !keptIds.has(item.id))
        .map((item) => item.id);
      await tx.shoppingItem.deleteMany({ where: { id: { in: removable } } });
      const purchased = await this.settle(tx, before, actor);

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
      return { view: listView(list), purchased };
    });
    void this.telegram.notifyListEdited(id);
    if (result.purchased) void this.telegram.notifyListPurchased(id);
    return result.view;
  }

  /** SUPER_ADMIN ko'rib chiqdi — ro'yxat xarid uchun adminga o'tadi. */
  async approve(id: string) {
    const view = await this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, id);
      if (!NOT_SENT_STATUSES.includes(before.status)) throw wrongStatus();
      if (before.items.length === 0) {
        throw AppException.badRequest('SHOPPING_LIST_EMPTY', "Bo'sh ro'yxatni yuborib bo'lmaydi");
      }
      const now = new Date();
      const list = await tx.shoppingList.update({
        where: { id },
        data: {
          status: ShoppingListStatus.APPROVED,
          approvedAt: now,
          reviewedAt: before.reviewedAt ?? now,
        },
        include: LIST_INCLUDE,
      });
      await this.audit.log(
        {
          action: 'shopping.approve',
          resource: 'shopping_list',
          resourceId: id,
          before: { status: before.status },
          after: { status: list.status },
        },
        tx,
      );
      return listView(list);
    });
    void this.telegram.notifyListApproved(id);
    return view;
  }

  /**
   * Bitta mahsulot sotib olindi: amaldagi miqdor va narx (jami yoki 1 birlik). Admin
   * faqat unga yuborilgan ro'yxatda, SUPER_ADMIN esa yopilmagan istalgan ro'yxatda
   * xarid qiladi. Hamma qator tugagach ro'yxat o'zi "sotib olingan" bo'ladi.
   */
  async purchaseItem(id: string, itemId: string, dto: PurchaseItemDto, actor: AuthUser) {
    const result = await this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, id);
      this.assertCanBuy(before, actor);
      const item = this.findItem(before, itemId);
      if (isDone(item)) {
        throw AppException.conflict(
          'SHOPPING_ITEM_DONE',
          `"${item.name}" allaqachon belgilangan — narxni "tuzatish" orqali o'zgartiring`,
        );
      }
      const quantity =
        dto.quantity !== undefined ? parseQuantity(dto.quantity, item.unit) : item.quantity;
      const price = this.resolvePrice(dto, quantity);
      await tx.shoppingItem.update({
        where: { id: item.id },
        data: {
          quantity,
          price,
          // Ro'yxatdagidan boshqa miqdor olinsa, rejadagi miqdor farq sifatida ko'rinadi.
          ...(!quantity.eq(item.quantity) && {
            requestedQuantity: item.requestedQuantity ?? item.quantity,
          }),
          purchasedAt: new Date(),
          purchasedByName: actor.fullName,
        },
      });
      return this.afterItemChange(tx, before, actor, 'shopping.item_purchase', {
        item: item.name,
        quantity: quantityString(quantity),
        price: moneyString(price),
      });
    });
    if (result.purchased) void this.telegram.notifyListPurchased(id);
    return result.view;
  }

  /** Mahsulot topilmadi yoki kerak bo'lmadi — "olinmadi" deb belgilanadi. */
  async skipItem(id: string, itemId: string, actor: AuthUser) {
    const result = await this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, id);
      this.assertCanBuy(before, actor);
      const item = this.findItem(before, itemId);
      if (isDone(item)) throw wrongStatus();
      await tx.shoppingItem.update({
        where: { id: item.id },
        data: {
          skipped: true,
          price: null,
          purchasedAt: new Date(),
          purchasedByName: actor.fullName,
        },
      });
      return this.afterItemChange(tx, before, actor, 'shopping.item_skip', { item: item.name });
    });
    if (result.purchased) void this.telegram.notifyListPurchased(id);
    return result.view;
  }

  /**
   * Belgini bekor qilish (xato bosilgan bo'lsa): qator yana "olinmagan" bo'ladi. Ro'yxat
   * sotib olingan holatda bo'lsa, xarid davom etayotgan holatga qaytadi.
   */
  async resetItem(id: string, itemId: string, actor: AuthUser) {
    const result = await this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, id);
      const reopening = before.status === ShoppingListStatus.PURCHASED;
      if (!reopening) this.assertCanBuy(before, actor);
      else if (!isSuperAdmin(actor) && !actor.permissions.includes('shopping:purchase')) {
        throw AppException.forbidden('FORBIDDEN', "Bu amal uchun ruxsatingiz yo'q");
      }
      const item = this.findItem(before, itemId);
      if (!isDone(item)) throw wrongStatus();
      await tx.shoppingItem.update({
        where: { id: item.id },
        data: {
          skipped: false,
          price: null,
          purchasedAt: null,
          purchasedByName: null,
          // Olingan miqdor rejadagidan farq qilgan bo'lsa — rejadagisiga qaytadi.
          ...(item.requestedQuantity && { quantity: item.requestedQuantity }),
        },
      });
      if (reopening) {
        await tx.shoppingList.update({
          where: { id },
          data: {
            status: before.approvedAt ? ShoppingListStatus.APPROVED : ShoppingListStatus.REVIEWED,
            purchasedAt: null,
            purchasedByName: null,
          },
        });
      }
      return this.afterItemChange(tx, before, actor, 'shopping.item_reset', { item: item.name });
    });
    if (result.purchased) void this.telegram.notifyListPurchased(id);
    return result.view;
  }

  /** Sotib olingan mahsulot narxini tuzatish (xato yozilgan bo'lsa). */
  async fixItemPrice(id: string, itemId: string, dto: FixItemPriceDto, actor: AuthUser) {
    const result = await this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, id);
      const allowed = isSuperAdmin(actor)
        ? before.status !== ShoppingListStatus.CONFIRMED
        : actor.permissions.includes('shopping:purchase') &&
          (before.status === ShoppingListStatus.APPROVED ||
            before.status === ShoppingListStatus.PURCHASED);
      if (!allowed) {
        throw AppException.conflict(
          'SHOPPING_LIST_LOCKED',
          "Yopilgan ro'yxat narxini o'zgartirib bo'lmaydi — avval tasdiqni bekor qiling",
        );
      }
      const item = this.findItem(before, itemId);
      if (item.price === null) {
        throw AppException.conflict(
          'SHOPPING_ITEM_NOT_PURCHASED',
          'Narxni faqat sotib olingan mahsulot uchun tuzatish mumkin',
        );
      }
      const price = this.resolvePrice(dto, item.quantity);
      await tx.shoppingItem.update({ where: { id: item.id }, data: { price } });
      return this.afterItemChange(tx, before, actor, 'shopping.item_price', {
        item: item.name,
        before: moneyString(item.price),
        price: moneyString(price),
      });
    });
    void this.telegram.notifyPriceFixed(id);
    return result.view;
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

  /** Oshpaz o'z ro'yxatini adminga yuborilguncha, SUPER_ADMIN esa yopilmaganini o'chira oladi. */
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
      } else if (!NOT_SENT_STATUSES.includes(list.status) || list.items.some(isDone)) {
        // Oshpaz xato yuborganini faqat adminga yuborilmaguncha bekor qila oladi.
        throw AppException.conflict(
          'SHOPPING_LIST_LOCKED',
          "Ro'yxat allaqachon adminga yuborilgan — endi uni bekor qilib bo'lmaydi",
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
    // Super admindagi e'lon "bekor qilindi" bo'lib tahrirlanadi.
    void this.telegram.notifyListEdited(id);
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

  /** Admin faqat unga yuborilgan ro'yxatda, SUPER_ADMIN — yopilmagan har qandayida. */
  private assertCanBuy(list: ShoppingListRecord, actor: AuthUser): void {
    if (isSuperAdmin(actor)) {
      if (![...NOT_SENT_STATUSES, ShoppingListStatus.APPROVED].includes(list.status)) {
        throw wrongStatus();
      }
      return;
    }
    if (!actor.permissions.includes('shopping:purchase')) {
      throw AppException.forbidden('FORBIDDEN', "Bu amal uchun ruxsatingiz yo'q");
    }
    if (list.status !== ShoppingListStatus.APPROVED) {
      throw AppException.conflict(
        'SHOPPING_NOT_SENT',
        "Xarid faqat super admin yuborgan ro'yxatda qilinadi",
      );
    }
  }

  private findItem(list: ShoppingListRecord, itemId: string): ItemRecord {
    const item = list.items.find((row) => row.id === itemId);
    if (!item) {
      throw AppException.notFound('SHOPPING_ITEM_NOT_FOUND', "Ro'yxatda bunday qator yo'q");
    }
    return item;
  }

  /** Jami summa aynan saqlanadi; 1 birlik narxi berilsa — narx × miqdor. */
  private resolvePrice(dto: { price?: string; unitPrice?: string }, quantity: Prisma.Decimal) {
    const price =
      dto.price !== undefined
        ? money(dto.price)
        : money(dto.unitPrice ?? '0')
            .mul(quantity)
            .toDecimalPlaces(2);
    if (price.isZero()) {
      throw AppException.badRequest('INVALID_AMOUNT', "Summa noldan katta bo'lishi kerak");
    }
    return price;
  }

  /** Hamma qator tugagan bo'lsa (kamida bittasi sotib olingan) — ro'yxat "sotib olingan". */
  private async settle(
    tx: Prisma.TransactionClient,
    before: ShoppingListRecord,
    actor: AuthUser,
  ): Promise<boolean> {
    const open: readonly ShoppingListStatus[] = [...NOT_SENT_STATUSES, ShoppingListStatus.APPROVED];
    if (!open.includes(before.status)) return false;
    const items = await tx.shoppingItem.findMany({ where: { listId: before.id } });
    const allDone = items.length > 0 && items.every((item) => item.skipped || item.price !== null);
    const anyBought = items.some((item) => !item.skipped && item.price !== null);
    if (!allDone || !anyBought) return false;
    await tx.shoppingList.update({
      where: { id: before.id },
      data: {
        status: ShoppingListStatus.PURCHASED,
        purchasedAt: new Date(),
        purchasedByName: actor.fullName,
      },
    });
    return true;
  }

  /**
   * Qator o'zgargandan keyin: hamma qator tugagan bo'lsa (kamida bittasi sotib olingan)
   * ro'yxat "sotib olingan" holatiga o'tadi. Audit yoziladi va yangi ko'rinish qaytadi.
   */
  private async afterItemChange(
    tx: Prisma.TransactionClient,
    before: ShoppingListRecord,
    actor: AuthUser,
    action: string,
    details: Record<string, string>,
  ) {
    const purchased = await this.settle(tx, before, actor);
    const list = await tx.shoppingList.findUniqueOrThrow({
      where: { id: before.id },
      include: LIST_INCLUDE,
    });
    await this.audit.log(
      {
        action,
        resource: 'shopping_list',
        resourceId: before.id,
        after: { ...details, status: list.status },
      },
      tx,
    );
    return { view: listView(list), purchased };
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
