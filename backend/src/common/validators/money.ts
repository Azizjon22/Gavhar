import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { Matches } from 'class-validator';

/** 13 xonagacha butun qism (trillionlar) va ko'pi bilan 2 kasr xona. */
export const MONEY_PATTERN = /^(0|[1-9]\d{0,12})(\.\d{1,2})?$/;

/**
 * Pul summasi. Hisob-kitobda `float` ishlatilmaydi: qiymat satr ko'rinishida
 * tekshiriladi va servisda `Prisma.Decimal` ga aylantiriladi. JSON'da son
 * bo'lib kelsa ham qabul qilinadi (xavfsiz butun son chegarasida).
 */
export function IsMoney(): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) => {
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
      return typeof value === 'string' ? value.trim() : value;
    }),
    Matches(MONEY_PATTERN, {
      message: "$property musbat pul summasi bo'lishi kerak (masalan 1500000 yoki 1500000.50)",
    }),
  );
}
