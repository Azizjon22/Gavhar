import type { LightboxItem } from '@/components/shared/Lightbox';
import type { Dish } from '@/features/menu/api/dishes.api';
import type { MenuPackage, MenuSection } from '@/features/menu/types/menu.types';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/** Paket tartib raqami rim raqamida (12 dan keyin — oddiy son). */
export const romanNumeral = (index: number): string => ROMAN[index] ?? String(index + 1);

export interface ShowDish {
  name: string;
  description: string | null;
  photo: { url: string; thumbUrl: string } | null;
}

const dishKey = (name: string): string => name.trim().toLowerCase();

/** Bo'limdagi taomlar: nomi paketdan, rasm va tavsifi taomlar katalogidan. */
export const sectionDishes = (section: MenuSection, dishes: Map<string, Dish>): ShowDish[] =>
  section.items.map((name) => {
    const dish = dishes.get(dishKey(name));
    return { name, description: dish?.description ?? null, photo: dish?.photo ?? null };
  });

/** Paketdagi taomlar soni: bo'limda nomlar yozilgan bo'lsa ular, bo'lmasa "necha xil". */
export const dishCount = (pkg: MenuPackage): number =>
  pkg.sections.reduce(
    (sum, section) => sum + Math.max(section.kindsCount, section.items.length),
    0,
  );

/** Paketdagi rasmli taomlar (takrorsiz) — kattalashtirib, varaqlab ko'rish uchun. */
export const packagePhotos = (pkg: MenuPackage, dishes: Map<string, Dish>): LightboxItem[] => {
  const seen = new Set<string>();
  return pkg.sections.flatMap((section) =>
    sectionDishes(section, dishes).flatMap((dish) => {
      if (!dish.photo || seen.has(dishKey(dish.name))) return [];
      seen.add(dishKey(dish.name));
      return [{ id: dish.name, kind: 'IMAGE' as const, caption: dish.name, ...dish.photo }];
    }),
  );
};

/** Muqova: paketga yuklangan rasm; u bo'lmasa — paketdagi birinchi rasmli taom. */
export const packageCover = (pkg: MenuPackage, dishes: Map<string, Dish>): string | null =>
  pkg.cover?.url ?? packagePhotos(pkg, dishes)[0]?.url ?? null;

/** Jami summa: 1 kishilik narx × mehmonlar. Butun so'mlarda, aniq hisob (BigInt). */
export const packageTotal = (pricePerGuest: string, guests: number): string =>
  (BigInt(pricePerGuest.split('.')[0] || '0') * BigInt(guests)).toString();

/**
 * Bir qatorga nechta karta sig'ishi — oxirgi qatorda yolg'iz karta qolmasligi uchun
 * (4 ta paket → 4 tadan, 3 yoki 6 ta → 3 tadan).
 */
export const cardsPerRow = (count: number): 3 | 4 =>
  count % 4 === 0 || (count > 4 && count % 3 !== 0) ? 4 : 3;
