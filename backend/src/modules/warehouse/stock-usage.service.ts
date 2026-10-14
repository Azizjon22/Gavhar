import { Injectable } from '@nestjs/common';
import { EventStatus, Prisma, StockMovementType, WarehouseSection } from '@prisma/client';
import { AppException } from '@/common/errors/app.exception';
import { AuthUser } from '@/common/types/auth-user';
import { addDays, localDate } from '@/common/utils/app-date.util';
import { moneyString } from '@/common/utils/money.util';
import { parseQuantity, quantityString } from '@/common/utils/quantity.util';
import { AppConfigService } from '@/config/app-config.service';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { PhotoService } from '@/infrastructure/storage/photo.service';
import { AuditService } from '@/modules/audit/audit.service';
import { TelegramService } from '@/modules/telegram/telegram.service';
import { defaultPhoto, defaultProduct } from '@/modules/shopping/default-catalog';
import { TakeStockDto } from './dto/warehouse.dto';
import { Allocation, applyMovement, costOf, lockItem } from './stock-ledger';
import { seesPrices } from './warehouse.service';

const USAGE_INCLUDE = {
  items: { orderBy: { name: 'asc' } },
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
} satisfies Prisma.StockUsageInclude;

type UsageRecord = Prisma.StockUsageGetPayload<{ include: typeof USAGE_INCLUDE }>;

const eventLabel = (event: UsageRecord['event']) =>
  `№ ${event.number} ${event.title ?? event.client.fullName}`;

/**
 * To'y uchun ombordan olingan mahsulotlar. Oshpaz faqat bugungi yoki ertangi to'y uchun
 * oladi; zaxira eng eski partiyadan sarflanadi va olingan narsa o'zi qanchaga tushgan
 * bo'lsa, shuncha deb to'yga yoziladi (narxni faqat SUPER_ADMIN ko'radi).
 */
@Injectable()
export class StockUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
    private readonly photos: PhotoService,
    private readonly telegram: TelegramService,
  ) {}

  private today(): string {
    return localDate(new Date(), this.config.app.timezone);
  }

  /** Oshpaz uchun ombor: oziq-ovqat mahsulotlari va miqdori — narxsiz. */
  async stock() {
    const items = await this.prisma.warehouseItem.findMany({
      where: { deletedAt: null, section: WarehouseSection.FOOD },
      orderBy: { name: 'asc' },
    });
    return Promise.all(
      items.map(async (item) => ({
        id: item.id,
        name: item.name,
        productCategory: item.productCategory ?? defaultProduct(item.name)?.productCategory ?? null,
        unit: item.unit,
        quantity: quantityString(item.quantity),
        // Ombordagi mahsulotga rasm yuklanmagan bo'lsa — nomiga mos standart rasm.
        photo:
          (await this.photos.urls(item.photoKey, item.photoThumbKey)) ?? defaultPhoto(item.name),
      })),
    );
  }

  async take(dto: TakeStockDto, actor: AuthUser) {
    const event = await this.prisma.event.findFirst({
      where: { id: dto.eventId, deletedAt: null },
      select: { id: true, status: true, startAt: true },
    });
    if (!event) throw AppException.notFound('EVENT_NOT_FOUND', 'Bron topilmadi');
    const day = localDate(event.startAt, this.config.app.timezone);
    const today = this.today();
    if (event.status === EventStatus.CANCELLED || day < today || day > addDays(today, 1)) {
      throw AppException.conflict(
        'STOCK_TAKE_DAY',
        "Ombordan faqat bugungi yoki ertangi to'y uchun olish mumkin",
      );
    }

    // Har mahsulot bitta qator; qat'iy tartibda qulflanadi — ikki oshpaz bir-birini kutib qolmaydi.
    const wanted = new Map<string, string>();
    for (const line of dto.items) {
      const previous = wanted.get(line.itemId);
      wanted.set(
        line.itemId,
        previous ? new Prisma.Decimal(previous).add(line.quantity).toString() : line.quantity,
      );
    }
    const itemIds = [...wanted.keys()].sort();

    const usage = await this.prisma.$transaction(async (tx) => {
      const created = await tx.stockUsage.create({
        data: { eventId: event.id, takenById: actor.id, takenByName: actor.fullName },
        include: USAGE_INCLUDE,
      });
      for (const itemId of itemIds) {
        const item = await lockItem(tx, itemId);
        if (item.section !== WarehouseSection.FOOD) {
          throw AppException.badRequest(
            'STOCK_TAKE_FOOD_ONLY',
            "To'y uchun faqat oziq-ovqat mahsuloti olinadi",
          );
        }
        const quantity = parseQuantity(wanted.get(itemId) ?? '0', item.unit);
        const { balance, allocations } = await applyMovement(
          tx,
          item,
          StockMovementType.OUT,
          quantity,
        );
        await tx.stockMovement.create({
          data: {
            itemId,
            type: StockMovementType.OUT,
            quantity,
            balanceAfter: balance,
            note: `To‘yga olindi: ${eventLabel(created.event)} (${actor.fullName})`,
            createdById: actor.id,
            createdByName: actor.fullName,
          },
        });
        await tx.stockUsageItem.create({
          data: {
            usageId: created.id,
            itemId,
            name: item.name,
            unit: item.unit,
            quantity,
            totalCost: costOf(allocations),
            allocations: allocations as unknown as Prisma.InputJsonValue,
          },
        });
      }
      const full = await tx.stockUsage.findUniqueOrThrow({
        where: { id: created.id },
        include: USAGE_INCLUDE,
      });
      await this.audit.log(
        {
          action: 'warehouse.take_for_event',
          resource: 'event',
          resourceId: event.id,
          after: {
            usageId: full.id,
            items: full.items.map((item) => `${item.name} — ${quantityString(item.quantity)}`),
          },
        },
        tx,
      );
      return full;
    });
    void this.telegram.notifyStockUsage(usage.id);
    return this.view(usage, seesPrices(actor));
  }

  /**
   * Olinganini qaytarish: har bir mahsulot o'z narxi va partiyasidagi joyiga qaytadi.
   * Oshpaz faqat o'zi bugun olganini qaytaradi; qolganini SUPER_ADMIN tuzatadi.
   */
  async giveBack(id: string, actor: AuthUser): Promise<void> {
    const usage = await this.prisma.stockUsage.findUnique({
      where: { id },
      include: USAGE_INCLUDE,
    });
    if (!usage) throw AppException.notFound('STOCK_USAGE_NOT_FOUND', 'Yozuv topilmadi');
    const sameDay = localDate(usage.createdAt, this.config.app.timezone) === this.today();
    if (!seesPrices(actor) && (usage.takenById !== actor.id || !sameDay)) {
      throw AppException.conflict(
        'STOCK_RETURN_FORBIDDEN',
        "Faqat bugun o'zingiz olgan mahsulotni qaytarishingiz mumkin — boshqasini super admin tuzatadi",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      for (const line of [...usage.items].sort((a, b) => a.itemId.localeCompare(b.itemId))) {
        let item = await lockItem(tx, line.itemId);
        for (const part of line.allocations as unknown as Allocation[]) {
          const result = await applyMovement(
            tx,
            item,
            StockMovementType.IN,
            new Prisma.Decimal(part.quantity),
            {
              unitPrice: part.unitPrice === null ? null : new Prisma.Decimal(part.unitPrice),
              restoreTo: part.lotCreatedAt ? new Date(part.lotCreatedAt) : new Date(),
            },
          );
          item = result.item;
        }
        await tx.stockMovement.create({
          data: {
            itemId: line.itemId,
            type: StockMovementType.IN,
            quantity: line.quantity,
            balanceAfter: item.quantity,
            note: `To‘ydan qaytarildi: ${eventLabel(usage.event)} (${actor.fullName})`,
            createdById: actor.id,
            createdByName: actor.fullName,
          },
        });
      }
      await tx.stockUsage.delete({ where: { id } });
      await this.audit.log(
        {
          action: 'warehouse.return_from_event',
          resource: 'event',
          resourceId: usage.eventId,
          before: {
            usageId: id,
            takenBy: usage.takenByName,
            items: usage.items.map((item) => `${item.name} — ${quantityString(item.quantity)}`),
          },
        },
        tx,
      );
    });
    // Super admindagi "olindi" xabariga javob qilib yoziladi.
    void this.telegram.notifyStockReturned(usage.telegramMessages, actor.fullName);
  }

  /** Oshpazning o'zi olganlari (oxirgi 30 tasi) — narxsiz. */
  async mine(actor: AuthUser) {
    const usages = await this.prisma.stockUsage.findMany({
      where: { takenById: actor.id },
      include: USAGE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return usages.map((usage) => this.view(usage, false));
  }

  /** Kim nimani qaysi to'y uchun olgan — bozorlikdan alohida. Narx faqat SUPER_ADMIN'ga. */
  async recent(actor: AuthUser) {
    const usages = await this.prisma.stockUsage.findMany({
      include: USAGE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return usages.map((usage) => this.view(usage, seesPrices(actor)));
  }

  /** Bitta to'y uchun olinganlar (hisob-kitob kartasi uchun). */
  async forEvent(eventId: string, showPrices: boolean) {
    const usages = await this.prisma.stockUsage.findMany({
      where: { eventId },
      include: USAGE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return usages.map((usage) => this.view(usage, showPrices));
  }

  private view(usage: UsageRecord, showPrices: boolean) {
    const priced = usage.items.every((item) => item.totalCost !== null);
    const total = usage.items.reduce(
      (sum, item) => (item.totalCost ? sum.add(item.totalCost) : sum),
      new Prisma.Decimal(0),
    );
    return {
      id: usage.id,
      createdAt: usage.createdAt,
      takenById: usage.takenById,
      takenByName: usage.takenByName,
      event: {
        id: usage.event.id,
        number: usage.event.number,
        title: usage.event.title,
        clientName: usage.event.client.fullName,
        startAt: usage.event.startAt,
      },
      items: usage.items.map((item) => ({
        id: item.id,
        itemId: item.itemId,
        name: item.name,
        unit: item.unit,
        quantity: quantityString(item.quantity),
        ...(showPrices && { totalCost: item.totalCost ? moneyString(item.totalCost) : null }),
      })),
      ...(showPrices && {
        /** Narxlangan qism summasi; `unpriced` — bir qismi hali narxlanmagan. */
        totalCost: moneyString(total),
        unpriced: !priced,
      }),
    };
  }
}
