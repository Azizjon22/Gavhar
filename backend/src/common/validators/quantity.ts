import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { Matches } from 'class-validator';

/** Musbat miqdor: butun qismi 9 xonagacha, kasri 3 xonagacha (masalan 12.5 kg). */
export const QUANTITY_PATTERN = /^(0|[1-9]\d{0,8})(\.\d{1,3})?$/;

/**
 * Ombor miqdori. Pul kabi satr ko'rinishida tekshiriladi va servisda
 * `Prisma.Decimal` ga aylantiriladi — kasrli kilogrammlarda aniqlik yo'qolmasin.
 */
export function IsQuantity(): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) => {
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
      return typeof value === 'string' ? value.trim().replace(',', '.') : value;
    }),
    Matches(QUANTITY_PATTERN, {
      message: "$property miqdor bo'lishi kerak (masalan 25 yoki 12.5)",
    }),
  );
}
