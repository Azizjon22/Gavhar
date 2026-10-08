import type { Language } from '@/stores/locale.store';

export interface MenuCategory {
  id: string;
  nameUz: string;
  nameRu: string;
  sortOrder: number;
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

export interface MenuPackage {
  id: string;
  name: string;
  description: string | null;
  /** 1 kishilik narx, so'mda, satr ko'rinishida. */
  pricePerGuest: string;
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
  pricePerGuest: string;
  badge: string | null;
  isActive: boolean;
  sections: { categoryId: string; kindsCount: number; items: string[] }[];
}

/** Bo'lim nomi joriy tilda. */
export const localizedName = (
  item: { nameUz: string; nameRu: string },
  language: Language,
): string => (language === 'ru' ? item.nameRu : item.nameUz);
