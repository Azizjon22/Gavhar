import { MenuCourse, MenuPackageType, PrismaClient } from '@prisma/client';
import { DEFAULT_CATEGORIES } from '../../src/modules/finance/expense-categories';

const MENU_CATEGORIES: ReadonlyArray<{
  nameUz: string;
  nameRu: string;
  kinds: number;
  course?: MenuCourse;
}> = [
  { nameUz: 'Salatlar', nameRu: 'Салаты', kinds: 4, course: 'SALAD' },
  { nameUz: 'Suyuq taomlar', nameRu: 'Первые блюда', kinds: 4, course: 'FIRST_DISH' },
  { nameUz: 'Quyuq taomlar', nameRu: 'Вторые блюда', kinds: 4, course: 'SECOND_DISH' },
  { nameUz: 'Mevalar', nameRu: 'Фрукты', kinds: 1 },
  { nameUz: 'Sir va go‘sht assorti', nameRu: 'Сырное и мясное ассорти', kinds: 1 },
  { nameUz: 'Sveji', nameRu: 'Свежие овощи', kinds: 1 },
  { nameUz: 'Salyoni', nameRu: 'Соленья', kinds: 1 },
  { nameUz: 'Sushi', nameRu: 'Суши', kinds: 1 },
  { nameUz: 'KFC', nameRu: 'KFC', kinds: 1 },
  { nameUz: 'Burek', nameRu: 'Бурек', kinds: 1 },
  { nameUz: 'Ichimliklar', nameRu: 'Напитки', kinds: 1 },
];

/**
 * Paket — belgilangan mehmonlar soni uchun qat'iy narx. "To'liq" paketga taomlardan
 * tashqari kortej, san'atkor va kamerachi kiradi; "Taomlar" — faqat to'yxona dasturxoni.
 */
const MENU_PACKAGES: ReadonlyArray<{
  name: string;
  price: number;
  guestCount: number;
  packageType: MenuPackageType;
  badge: string | null;
  description: string;
}> = [
  {
    name: 'To‘liq paket — 100 kishi',
    price: 32_000_000,
    guestCount: 100,
    packageType: MenuPackageType.FULL,
    badge: null,
    description: 'Dasturxon, kortej, san’atkor va kamerachi — hammasi bir joyda',
  },
  {
    name: 'To‘liq paket — 150 kishi',
    price: 38_000_000,
    guestCount: 150,
    packageType: MenuPackageType.FULL,
    badge: null,
    description: 'Dasturxon, kortej, san’atkor va kamerachi — hammasi bir joyda',
  },
  {
    name: 'To‘liq paket — 200 kishi',
    price: 46_000_000,
    guestCount: 200,
    packageType: MenuPackageType.FULL,
    badge: 'VIP',
    description: 'Eng katta va hashamatli to‘y uchun to‘liq paket',
  },
  {
    name: 'Taomlar — 100 kishi',
    price: 24_000_000,
    guestCount: 100,
    packageType: MenuPackageType.FOOD_ONLY,
    badge: null,
    description: 'Faqat to‘yxona dasturxoni',
  },
  {
    name: 'Taomlar — 150 kishi',
    price: 29_000_000,
    guestCount: 150,
    packageType: MenuPackageType.FOOD_ONLY,
    badge: null,
    description: 'Faqat to‘yxona dasturxoni',
  },
  {
    name: 'Taomlar — 200 kishi',
    price: 37_000_000,
    guestCount: 200,
    packageType: MenuPackageType.FOOD_ONLY,
    badge: null,
    description: 'Faqat to‘yxona dasturxoni',
  },
];

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
 * Boshlang'ich kontent: menyu bo'limlari, oltita paket va galereya albomlari.
 * Faqat tegishli jadval bo'sh bo'lganda yaratiladi — keyin kiritilgan
 * o'zgarishlar qayta seed qilinganda yo'qolmaydi.
 */
export async function seedDemoContent(prisma: PrismaClient): Promise<DemoContentResult> {
  const menuCreated =
    (await prisma.menuCategory.count()) === 0 && (await prisma.menuPackage.count()) === 0;
  if (menuCreated) {
    const categories = await prisma.$transaction(
      MENU_CATEGORIES.map(({ nameUz, nameRu, course }, sortOrder) =>
        prisma.menuCategory.create({ data: { nameUz, nameRu, course, sortOrder } }),
      ),
    );
    for (const [sortOrder, pkg] of MENU_PACKAGES.entries()) {
      await prisma.menuPackage.create({
        data: {
          name: pkg.name,
          description: pkg.description,
          badge: pkg.badge,
          price: pkg.price,
          guestCount: pkg.guestCount,
          packageType: pkg.packageType,
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
