import { ProductCategory, WarehouseUnit } from '@prisma/client';
import { DEFAULT_PRODUCTS } from './default-products';

/** To'y oshxonasida eng ko'p ishlatiladigan mahsulot — oshpaz katalogida doim bor. */
export interface DefaultProduct {
  name: string;
  unit: WarehouseUnit;
  productCategory: ProductCategory;
  /** `frontend/public/kitchen/products/<image>.webp`; bo'sh — rasm tanlanmagan. */
  image: string | null;
}

export interface CatalogPhoto {
  url: string;
  thumbUrl: string;
}

/**
 * Nomni solishtirish uchun: kichik harf, apostrofning barcha ko'rinishlari bitta,
 * ortiqcha bo'shliqsiz. "Qo‘y go‘shti", "Qo'y go`shti" va "qo’y  go’shti" — bitta mahsulot.
 */
export const productKey = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[‘’`ʻʼ']/g, "'")
    .replace(/\s+/g, ' ');

const BY_NAME = new Map(DEFAULT_PRODUCTS.map((product) => [productKey(product.name), product]));

/** Standart mahsulot: aynan shu nom yoki qavs ichidagi izohsiz nomi ("Guruch (devzira)"). */
export const defaultProduct = (name: string): DefaultProduct | undefined =>
  BY_NAME.get(productKey(name)) ?? BY_NAME.get(productKey(name.replace(/\(.*\)/g, '')));

/** Mahsulotning o'z rasmi bo'lmasa — nomiga mos standart rasm (bo'lsa). */
export const defaultPhoto = (name: string): CatalogPhoto | null => {
  const image = defaultProduct(name)?.image;
  if (!image) return null;
  const url = `/kitchen/products/${image}.webp`;
  return { url, thumbUrl: url };
};
