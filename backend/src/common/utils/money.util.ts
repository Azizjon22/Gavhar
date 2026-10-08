import { Prisma } from '@prisma/client';

export type Money = Prisma.Decimal;

export const ZERO = new Prisma.Decimal(0);

/** Tekshirilgan satr yoki sondan aniq o'nlik qiymat. Pul hisobida `number` ishlatilmaydi. */
export const money = (value: string | number | Prisma.Decimal): Money => new Prisma.Decimal(value);

/** API javobi uchun: har doim ikki kasr xonali satr. */
export const moneyString = (value: Prisma.Decimal): string => value.toFixed(2);

/** Tiyingacha yaxlitlash (yarim — yuqoriga). */
export const roundMoney = (value: Prisma.Decimal): Money =>
  value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
