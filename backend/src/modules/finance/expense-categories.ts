import { ExpenseCategory, Prisma } from '@prisma/client';

/** Tizim kategoriyalari: tasdiqlangan bozorlik shu kategoriyaga yoziladi. */
export const SYSTEM_CATEGORIES = {
  SHOPPING: 'Bozorlik',
} as const;
export type SystemCategoryCode = keyof typeof SYSTEM_CATEGORIES;

/** Yangi o'rnatilgan tizim uchun boshlang'ich xarajat turlari. */
export const DEFAULT_CATEGORIES: readonly { name: string; code?: SystemCategoryCode }[] = [
  { name: SYSTEM_CATEGORIES.SHOPPING, code: 'SHOPPING' },
  // To'y xarajatlari.
  { name: 'Kamerachi' },
  { name: 'San’atkor' },
  { name: 'Kortej' },
  { name: 'Oshpazga to‘lov' },
  { name: 'Ofitsiantlarga to‘lov' },
  { name: 'Zavzalga to‘lov' },
  { name: 'Moyka' },
  // Umumiy xarajatlar.
  { name: 'Ish haqi' },
  { name: 'Kommunal to‘lovlar' },
  { name: 'Idish-tovoq va jihozlar' },
  { name: 'Ta’mirlash' },
  { name: 'Transport' },
  { name: 'Reklama' },
  { name: 'Boshqa' },
];

/**
 * Tizim kategoriyasini topadi; yo'q bo'lsa yaratadi. Shu nomli oddiy
 * kategoriya bo'lsa, takror yaratmasdan o'shani tizimniki qilib belgilaydi.
 */
export async function ensureSystemCategory(
  tx: Prisma.TransactionClient,
  code: SystemCategoryCode,
): Promise<ExpenseCategory> {
  const existing = await tx.expenseCategory.findUnique({ where: { code } });
  if (existing) return existing;

  const name = SYSTEM_CATEGORIES[code];
  const sameName = await tx.expenseCategory.findFirst({
    where: { deletedAt: null, code: null, name: { equals: name, mode: 'insensitive' } },
  });
  return sameName
    ? tx.expenseCategory.update({ where: { id: sameName.id }, data: { code } })
    : tx.expenseCategory.create({ data: { name, code } });
}
