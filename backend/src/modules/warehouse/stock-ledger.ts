import { Prisma, StockMovementType, WarehouseItem } from '@prisma/client';
import { AppException } from '@/common/errors/app.exception';
import { quantityString } from '@/common/utils/quantity.util';

type Tx = Prisma.TransactionClient;
const ZERO = new Prisma.Decimal(0);

/** Chiqimning bitta partiyaga to'g'ri kelgan qismi: qancha va qaysi narxda olindi. */
export interface Allocation {
  quantity: string;
  unitPrice: string | null;
  /** Partiya ochilgan vaqt — qaytarilganda navbatdagi o'rni saqlanishi uchun. */
  lotCreatedAt?: string;
}

export interface MovementResult {
  item: WarehouseItem;
  balance: Prisma.Decimal;
  allocations: Allocation[];
}

/**
 * Mahsulot qatorini qulflab o'qiydi: bir mahsulot ustidagi harakatlar navbat bilan
 * bajariladi — na qoldiq, na partiyalar manfiyga tushmaydi.
 */
export async function lockItem(tx: Tx, itemId: string): Promise<WarehouseItem> {
  await tx.$queryRaw`SELECT id FROM warehouse_items WHERE id = ${itemId}::uuid FOR UPDATE`;
  const item = await tx.warehouseItem.findFirst({ where: { id: itemId, deletedAt: null } });
  if (!item) throw AppException.notFound('WAREHOUSE_ITEM_NOT_FOUND', 'Mahsulot topilmadi');
  return item;
}

/** Partiyalar qiymati: narxlangan qism summasi va narxi kiritilmagan miqdor. */
export function costOf(allocations: readonly Allocation[]): Prisma.Decimal | null {
  if (allocations.some((part) => part.unitPrice === null)) return null;
  return allocations
    .reduce(
      (sum, part) => sum.add(new Prisma.Decimal(part.quantity).mul(part.unitPrice ?? 0)),
      ZERO,
    )
    .toDecimalPlaces(2);
}

/**
 * Bitta harakatni (qulflangan mahsulot ustida) qo'llaydi va qoldiqni yangilaydi.
 *
 * Kirim: narx berilmasa (`undefined`) eng yangi partiya narxi olinadi. Narx eng yangi
 * partiyaniki bilan bir xil bo'lsa unga qo'shiladi, aks holda yangi partiya ochiladi.
 * Qaytarilgan mahsulot (`restoreTo`) o'z narxidagi partiyaga yoki o'sha vaqtdagi joyiga
 * qaytadi — eskiroq (arzonroq) mahsulot baribir birinchi sarflanadi.
 *
 * Chiqim: eng eski partiyadan boshlab sarflanadi. Bo'shagan partiya o'chiriladi (eng
 * yangisidan tashqari — u narxsiz kirim uchun oxirgi narxni eslab turadi).
 */
export async function applyMovement(
  tx: Tx,
  item: WarehouseItem,
  type: StockMovementType,
  amount: Prisma.Decimal,
  options: { unitPrice?: Prisma.Decimal | null; restoreTo?: Date } = {},
): Promise<MovementResult> {
  if (type === StockMovementType.OUT && amount.gt(item.quantity)) {
    throw AppException.conflict('INSUFFICIENT_STOCK', 'Omborda buncha qoldiq yo‘q', {
      name: item.name,
      available: quantityString(item.quantity),
    });
  }

  const lots = await tx.warehouseLot.findMany({
    where: { itemId: item.id },
    orderBy: { createdAt: 'asc' },
  });
  const newest = lots.at(-1);
  const allocations: Allocation[] = [];

  if (type === StockMovementType.IN) {
    const price =
      options.unitPrice === undefined
        ? (newest?.unitPrice ?? null)
        : (options.unitPrice?.toDecimalPlaces(2) ?? null);
    const samePrice = (lot: (typeof lots)[number]) =>
      lot.unitPrice === null ? price === null : price !== null && lot.unitPrice.eq(price);
    const target = options.restoreTo
      ? lots.find(samePrice)
      : newest && samePrice(newest)
        ? newest
        : undefined;
    if (target) {
      await tx.warehouseLot.update({
        where: { id: target.id },
        data: { quantity: { increment: amount } },
      });
    } else {
      await tx.warehouseLot.create({
        data: {
          itemId: item.id,
          quantity: amount,
          unitPrice: price,
          ...(options.restoreTo && { createdAt: options.restoreTo }),
        },
      });
    }
  } else {
    let left = amount;
    for (const lot of lots) {
      if (left.lte(ZERO)) break;
      if (lot.quantity.lte(ZERO)) continue;
      const take = Prisma.Decimal.min(lot.quantity, left);
      allocations.push({
        quantity: take.toString(),
        unitPrice: lot.unitPrice?.toString() ?? null,
        lotCreatedAt: lot.createdAt.toISOString(),
      });
      left = left.sub(take);
      if (take.eq(lot.quantity) && lot.id !== newest?.id) {
        await tx.warehouseLot.delete({ where: { id: lot.id } });
      } else {
        await tx.warehouseLot.update({
          where: { id: lot.id },
          data: { quantity: { decrement: take } },
        });
      }
    }
    // Partiyasi yo'q qoldiq (eski ma'lumot) — narxi noma'lum.
    if (left.gt(ZERO)) allocations.push({ quantity: left.toString(), unitPrice: null });
  }

  const balance =
    type === StockMovementType.IN ? item.quantity.add(amount) : item.quantity.sub(amount);
  const updated = await tx.warehouseItem.update({
    where: { id: item.id },
    data: { quantity: balance },
  });
  return { item: updated, balance, allocations };
}
