import { PrismaClient } from '@prisma/client';
import { DEFAULT_CATEGORIES } from '../../src/modules/finance/expense-categories';

const MENU_CATEGORIES: ReadonlyArray<{ nameUz: string; nameRu: string; kinds: number }> = [
  { nameUz: 'Salatlar', nameRu: 'Салаты', kinds: 4 },
  { nameUz: 'Suyuq taomlar', nameRu: 'Первые блюда', kinds: 4 },
  { nameUz: 'Quyuq taomlar', nameRu: 'Вторые блюда', kinds: 4 },
  { nameUz: 'Mevalar', nameRu: 'Фрукты', kinds: 1 },
  { nameUz: 'Sir va go‘sht assorti', nameRu: 'Сырное и мясное ассорти', kinds: 1 },
  { nameUz: 'Sveji', nameRu: 'Свежие овощи', kinds: 1 },
  { nameUz: 'Salyoni', nameRu: 'Соленья', kinds: 1 },
  { nameUz: 'Sushi', nameRu: 'Суши', kinds: 1 },
  { nameUz: 'KFC', nameRu: 'KFC', kinds: 1 },
  { nameUz: 'Burek', nameRu: 'Бурек', kinds: 1 },
  { nameUz: 'Ichimliklar', nameRu: 'Напитки', kinds: 1 },
];

const MENU_PACKAGES = [
  {
    name: 'Standart',
    price: 160_000,
    badge: null,
    description: 'To‘kin dasturxon uchun asosiy tanlov',
  },
  { name: 'Premium', price: 200_000, badge: null, description: 'Kengaytirilgan dasturxon' },
  { name: 'VIP', price: 280_000, badge: 'VIP', description: 'Eng to‘liq va hashamatli dasturxon' },
] as const;

const GALLERY_ALBUMS = [
  'Umumiy zal',
  'Stol bezatilishi',
  'Kortej',
  'San’atkorlar',
  'Wedding Studio Gavhar',
];

export interface DemoContentResult {
  menuCreated: boolean;
  albumsCreated: boolean;
}

/**
 * Boshlang'ich kontent: menyu bo'limlari, uchta paket va galereya albomlari.
 * Faqat tegishli jadval bo'sh bo'lganda yaratiladi — keyin kiritilgan
 * o'zgarishlar qayta seed qilinganda yo'qolmaydi.
 */
export async function seedDemoContent(prisma: PrismaClient): Promise<DemoContentResult> {
  const menuCreated =
    (await prisma.menuCategory.count()) === 0 && (await prisma.menuPackage.count()) === 0;
  if (menuCreated) {
    const categories = await prisma.$transaction(
      MENU_CATEGORIES.map(({ nameUz, nameRu }, sortOrder) =>
        prisma.menuCategory.create({ data: { nameUz, nameRu, sortOrder } }),
      ),
    );
    for (const [sortOrder, pkg] of MENU_PACKAGES.entries()) {
      await prisma.menuPackage.create({
        data: {
          name: pkg.name,
          description: pkg.description,
          badge: pkg.badge,
          pricePerGuest: pkg.price,
          sortOrder,
          prices: { create: { price: pkg.price } },
          sections: {
            create: categories.map((category, index) => ({
              categoryId: category.id,
              kindsCount: MENU_CATEGORIES[index]?.kinds ?? 1,
            })),
          },
        },
      });
    }
  }

  const albumsCreated = (await prisma.galleryAlbum.count()) === 0;
  if (albumsCreated) {
    await prisma.galleryAlbum.createMany({
      data: GALLERY_ALBUMS.map((title, sortOrder) => ({ title, sortOrder })),
    });
  }

  return { menuCreated, albumsCreated };
}

/**
 * Boshlang'ich xarajat turlari. Yetishmayotganlari qo'shiladi; mavjudlari va
 * SUPER_ADMIN o'chirganlari (nomi bo'yicha) qayta yaratilmaydi.
 */
export async function seedExpenseCategories(prisma: PrismaClient): Promise<number> {
  const existing = await prisma.expenseCategory.findMany({ select: { name: true, code: true } });
  const names = new Set(existing.map((category) => category.name.toLowerCase()));
  const codes = new Set(existing.map((category) => category.code));
  const missing = DEFAULT_CATEGORIES.filter(
    (category) =>
      !names.has(category.name.toLowerCase()) && !(category.code && codes.has(category.code)),
  );
  if (missing.length > 0) {
    await prisma.expenseCategory.createMany({ data: missing.map((category) => ({ ...category })) });
  }
  return missing.length;
}
