import { Injectable } from '@nestjs/common';
import {
  Prisma,
  StockMovement,
  StockMovementType,
  WarehouseItem,
  WarehouseSection,
} from '@prisma/client';
import { Paginated, PaginationQueryDto } from '@/common/dto/pagination.dto';
import { AppException } from '@/common/errors/app.exception';
import { AuthUser } from '@/common/types/auth-user';
import { money, moneyString } from '@/common/utils/money.util';
import { parseQuantity, quantityString } from '@/common/utils/quantity.util';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { PhotoService } from '@/infrastructure/storage/photo.service';
import { auditDiff } from '@/modules/audit/audit-sanitizer';
import { AuditService } from '@/modules/audit/audit.service';
import {
  CreateItemDto,
  CreateMovementDto,
  ListItemsQueryDto,
  StockCountDto,
  UpdateItemDto,
} from './dto/warehouse.dto';

const ZERO = new Prisma.Decimal(0);

const movementView = (movement: StockMovement) => ({
  id: movement.id,
  type: movement.type,
  quantity: quantityString(movement.quantity),
  balanceAfter: quantityString(movement.balanceAfter),
  totalCost: movement.totalCost ? moneyString(movement.totalCost) : null,
  note: movement.note,
  createdByName: movement.createdByName,
  createdAt: movement.createdAt,
});

const auditFields = (item: WarehouseItem) => ({
  section: item.section,
  productCategory: item.productCategory,
  name: item.name,
  unit: item.unit,
  minQuantity: quantityString(item.minQuantity),
  note: item.note,
});

const notFound = () => AppException.notFound('WAREHOUSE_ITEM_NOT_FOUND', 'Mahsulot topilmadi');

@Injectable()
export class WarehouseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly photos: PhotoService,
  ) {}

  async list(query: ListItemsQueryDto) {
    const items = await this.prisma.warehouseItem.findMany({
      where: { deletedAt: null, ...(query.section && { section: query.section }) },
      orderBy: { name: 'asc' },
    });
    return Promise.all(items.map((item) => this.view(item)));
  }

  async create(dto: CreateItemDto, actor: AuthUser) {
    await this.assertNameAvailable(dto.section, dto.name);
    const minQuantity = parseQuantity(dto.minQuantity ?? '0', dto.unit, true);
    const initial = parseQuantity(dto.initialQuantity ?? '0', dto.unit, true);

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.warehouseItem.create({
        data: {
          section: dto.section,
          // Mahsulot turi faqat oziq-ovqatda ma'noga ega.
          productCategory:
            dto.section === WarehouseSection.FOOD ? (dto.productCategory ?? null) : null,
          name: dto.name,
          unit: dto.unit,
          quantity: initial,
          minQuantity,
          note: dto.note || null,
        },
      });
      if (initial.gt(ZERO)) {
        await tx.stockMovement.create({
          data: {
            itemId: item.id,
            type: StockMovementType.IN,
            quantity: initial,
            balanceAfter: initial,
            note: 'Boshlang‘ich qoldiq',
            createdById: actor.id,
            createdByName: actor.fullName,
          },
        });
      }
      await this.audit.log(
        {
          action: 'warehouse.create',
          resource: 'warehouse_item',
          resourceId: item.id,
          after: { ...auditFields(item), quantity: quantityString(item.quantity) },
        },
        tx,
      );
      return this.view(item);
    });
  }

  async update(id: string, dto: UpdateItemDto) {
    const before = await this.findRecord(id);
    if (dto.name !== undefined && dto.name.toLowerCase() !== before.name.toLowerCase()) {
      await this.assertNameAvailable(before.section, dto.name, id);
    }
    const unit = dto.unit ?? before.unit;
    // Qoldiq bor paytda birlik o'zgarsa, "40 kg" o'z-o'zidan "40 dona" bo'lib qoladi.
    if (unit !== before.unit && !before.quantity.isZero()) {
      throw AppException.conflict(
        'UNIT_CHANGE_WITH_STOCK',
        "Qoldig'i bor mahsulotning o'lchov birligini o'zgartirib bo'lmaydi — avval qoldiqni 0 ga tushiring",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.warehouseItem.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.unit !== undefined && { unit: dto.unit }),
          ...(dto.productCategory !== undefined &&
            before.section === WarehouseSection.FOOD && {
              productCategory: dto.productCategory,
            }),
          ...(dto.minQuantity !== undefined && {
            minQuantity: parseQuantity(dto.minQuantity, unit, true),
          }),
          ...(dto.note !== undefined && { note: dto.note || null }),
        },
      });
      const diff = auditDiff(auditFields(before), auditFields(item));
      if (diff) {
        await this.audit.log(
          { action: 'warehouse.update', resource: 'warehouse_item', resourceId: id, ...diff },
          tx,
        );
      }
      return this.view(item);
    });
  }

  async remove(id: string): Promise<void> {
    const item = await this.findRecord(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.warehouseItem.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.log(
        {
          action: 'warehouse.delete',
          resource: 'warehouse_item',
          resourceId: id,
          before: { ...auditFields(item), quantity: quantityString(item.quantity) },
        },
        tx,
      );
    });
  }

  /**
   * Kirim yoki chiqim. Mahsulot qatori qulflanadi — bir vaqtda kelgan ikki
   * chiqim qoldiqni manfiyga tushira olmaydi.
   */
  async addMovement(id: string, dto: CreateMovementDto, actor: AuthUser) {
    const isIn = dto.type === StockMovementType.IN;
    if (dto.totalCost !== undefined && !isIn) {
      throw AppException.badRequest(
        'COST_ONLY_FOR_STOCK_IN',
        'Xarid summasi faqat kirimda kiritiladi',
      );
    }
    const cost = dto.totalCost !== undefined ? money(dto.totalCost) : null;
    if (cost?.isZero()) {
      throw AppException.badRequest('INVALID_AMOUNT', "Summa noldan katta bo'lishi kerak");
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM warehouse_items WHERE id = ${id}::uuid FOR UPDATE`;
      const item = await tx.warehouseItem.findFirst({ where: { id, deletedAt: null } });
      if (!item) throw notFound();

      const quantity = parseQuantity(dto.quantity, item.unit);
      if (!isIn && quantity.gt(item.quantity)) {
        throw AppException.conflict('INSUFFICIENT_STOCK', 'Omborda buncha qoldiq yo‘q', {
          available: quantityString(item.quantity),
        });
      }
      const balance = isIn ? item.quantity.add(quantity) : item.quantity.sub(quantity);

      const movement = await tx.stockMovement.create({
        data: {
          itemId: id,
          type: dto.type,
          quantity,
          balanceAfter: balance,
          totalCost: cost,
          note: dto.note || null,
          createdById: actor.id,
          createdByName: actor.fullName,
        },
      });
      const updated = await tx.warehouseItem.update({
        where: { id },
        data: { quantity: balance },
      });

      await this.audit.log(
        {
          action: isIn ? 'warehouse.stock_in' : 'warehouse.stock_out',
          resource: 'warehouse_item',
          resourceId: id,
          before: { quantity: quantityString(item.quantity) },
          after: {
            name: item.name,
            quantity: quantityString(balance),
            change: `${isIn ? '+' : '−'}${quantityString(quantity)}`,
            ...(cost && { totalCost: moneyString(cost) }),
            ...(movement.note && { note: movement.note }),
          },
        },
        tx,
      );
      return this.view(updated);
    });
  }

  /**
   * Inventarizatsiya: sanab chiqilgan haqiqiy miqdor bilan yozuvdagi qoldiq farqi
   * oddiy kirim yoki chiqim bo'lib yoziladi — tarix baribir qoldiqqa teng chiqadi.
   */
  async count(id: string, dto: StockCountDto, actor: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM warehouse_items WHERE id = ${id}::uuid FOR UPDATE`;
      const item = await tx.warehouseItem.findFirst({ where: { id, deletedAt: null } });
      if (!item) throw notFound();

      const actual = parseQuantity(dto.actual, item.unit, true);
      const diff = actual.sub(item.quantity);
      if (diff.isZero()) return this.view(item);

      await tx.stockMovement.create({
        data: {
          itemId: id,
          type: diff.isPositive() ? StockMovementType.IN : StockMovementType.OUT,
          quantity: diff.abs(),
          balanceAfter: actual,
          note: ['Inventarizatsiya', dto.note].filter(Boolean).join(': '),
          createdById: actor.id,
          createdByName: actor.fullName,
        },
      });
      const updated = await tx.warehouseItem.update({ where: { id }, data: { quantity: actual } });
      await this.audit.log(
        {
          action: 'warehouse.stock_count',
          resource: 'warehouse_item',
          resourceId: id,
          before: { quantity: quantityString(item.quantity) },
          after: { name: item.name, quantity: quantityString(actual) },
        },
        tx,
      );
      return this.view(updated);
    });
  }

  /** Butun ombor bo'yicha so'nggi harakatlar — faoliyat lentasi uchun. */
  async recentMovements(limit: number) {
    const movements = await this.prisma.stockMovement.findMany({
      where: { item: { deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      include: { item: { select: { id: true, name: true, unit: true, section: true } } },
    });
    return movements.map((movement) => ({ ...movementView(movement), item: movement.item }));
  }

  async setPhoto(id: string, file: Express.Multer.File | undefined) {
    const item = await this.findRecord(id);
    const photo = await this.photos.store(`warehouse/${id}`, file);
    const updated = await this.prisma.warehouseItem.update({
      where: { id },
      data: { photoKey: photo.objectKey, photoThumbKey: photo.thumbKey },
    });
    await this.photos.remove(item.photoKey, item.photoThumbKey);
    return this.view(updated);
  }

  async removePhoto(id: string) {
    const item = await this.findRecord(id);
    const updated = await this.prisma.warehouseItem.update({
      where: { id },
      data: { photoKey: null, photoThumbKey: null },
    });
    await this.photos.remove(item.photoKey, item.photoThumbKey);
    return this.view(updated);
  }

  async listMovements(id: string, query: PaginationQueryDto) {
    await this.findRecord(id);
    const where = { itemId: id };
    const [items, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return Paginated.of(items.map(movementView), total, query);
  }

  private async view(item: WarehouseItem) {
    return {
      id: item.id,
      section: item.section,
      productCategory: item.productCategory,
      name: item.name,
      unit: item.unit,
      quantity: quantityString(item.quantity),
      minQuantity: quantityString(item.minQuantity),
      /** Qoldiq belgilangan chegaraga tushgan. */
      isLow: item.minQuantity.gt(ZERO) && item.quantity.lte(item.minQuantity),
      note: item.note,
      photo: await this.photos.urls(item.photoKey, item.photoThumbKey),
      updatedAt: item.updatedAt,
    };
  }

  private async findRecord(id: string): Promise<WarehouseItem> {
    const item = await this.prisma.warehouseItem.findFirst({ where: { id, deletedAt: null } });
    if (!item) throw notFound();
    return item;
  }

  private async assertNameAvailable(
    section: WarehouseItem['section'],
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const taken = await this.prisma.warehouseItem.findFirst({
      where: {
        deletedAt: null,
        section,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId && { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    if (taken) {
      throw AppException.conflict(
        'WAREHOUSE_ITEM_NAME_TAKEN',
        'Bu bo‘limda bunday nomli mahsulot mavjud',
      );
    }
  }
}
