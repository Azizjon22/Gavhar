import type { Language } from '@/stores/locale.store';

export interface MenuCategory {
  id: string;
  nameUz: string;
  nameRu: string;
  /** Oshxona bosqichi: oshpaz bozorlikni shu tartibda yozadi. */
  course: MenuCourse;
  sortOrder: number;
}

export const MENU_COURSES = ['SALAD', 'FIRST_DISH', 'SECOND_DISH', 'OTHER'] as const;
export type MenuCourse = (typeof MENU_COURSES)[number];

export interface CategoryPayload {
  nameUz: string;
  nameRu: string;
  course: MenuCourse;
}

export interface MenuSection {
  categoryId: string;
  nameUz: string;
  nameRu: string;
  /** Necha xil (masalan 4 xil salat). */
  kindsCount: number;
  /** Aniq taom nomlari (bo'sh bo'lishi mumkin). */
  items: string[];
}

/** FULL — taomlar, kortej, san'atkor va kamerachi; FOOD_ONLY — faqat to'yxona taomlari. */
export const PACKAGE_TYPES = ['FULL', 'FOOD_ONLY'] as const;
export type MenuPackageType = (typeof PACKAGE_TYPES)[number];

export interface MenuPackage {
  id: string;
  name: string;
  description: string | null;
  /** Butun paket narxi `guestCount` mehmon uchun, so'mda (1 kishilik narx emas). */
  price: string;
  guestCount: number;
  packageType: MenuPackageType;
  badge: string | null;
  isActive: boolean;
  sortOrder: number;
  /** Taqdimotdagi muqova rasmi (muddatli imzolangan havolalar). */
  cover: { url: string; thumbUrl: string } | null;
  sections: MenuSection[];
  updatedAt: string;
}

export interface MenuPackagePayload {
  name: string;
  description: string | null;
  price: string;
  guestCount: number;
  packageType: MenuPackageType;
  badge: string | null;
  isActive: boolean;
  sections: { categoryId: string; kindsCount: number; items: string[] }[];
}

/** Bo'lim nomi joriy tilda. */
export const localizedName = (
  item: { nameUz: string; nameRu: string },
  language: Language,
): string => (language === 'ru' ? item.nameRu : item.nameUz);
