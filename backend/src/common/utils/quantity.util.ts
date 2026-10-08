import { Prisma, WarehouseUnit } from '@prisma/client';
import { AppException } from '@/common/errors/app.exception';

/** Donalab sanaladigan birliklar — kasr miqdor qabul qilinmaydi. */
export const WHOLE_UNITS: ReadonlySet<WarehouseUnit> = new Set<WarehouseUnit>([
  WarehouseUnit.PIECE,
  WarehouseUnit.PACK,
  WarehouseUnit.BOX,
  WarehouseUnit.SET,
]);

export const UNIT_LABELS: Record<WarehouseUnit, string> = {
  PIECE: 'dona',
  KG: 'kg',
  LITER: 'l',
  PACK: 'qadoq',
  BOX: 'quti',
  SET: 'to‘plam',
};

/** Miqdor ortiqcha nollarsiz satr ko'rinishida uzatiladi: "12.5", "300". */
export const quantityString = (value: Prisma.Decimal): string => value.toString();

/** Tekshirilgan satrdan miqdor; birlikka mos kelmasa (masalan 1.5 dona) rad etiladi. */
export function parseQuantity(
  value: string,
  unit: WarehouseUnit,
  allowZero = false,
): Prisma.Decimal {
  const quantity = new Prisma.Decimal(value);
  if (!allowZero && quantity.isZero()) {
    throw AppException.badRequest('INVALID_QUANTITY', "Miqdor noldan katta bo'lishi kerak");
  }
  if (WHOLE_UNITS.has(unit) && !quantity.isInteger()) {
    throw AppException.badRequest(
      'QUANTITY_MUST_BE_WHOLE',
      'Bu birlikda miqdor butun son bo‘lishi kerak',
    );
  }
  return quantity;
}
