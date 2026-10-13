import type { EventStatus, EventType } from '@/features/events/types/event.types';
import type { ProductCategory, WarehouseUnit } from '@/features/warehouse/types/warehouse.types';

export const SHOPPING_STATUSES = [
  'SUBMITTED',
  'REVIEWED',
  'APPROVED',
  'PURCHASED',
  'CONFIRMED',
] as const;
export type ShoppingStatus = (typeof SHOPPING_STATUSES)[number];

export interface ShoppingItem {
  id: string;
  name: string;
  unit: WarehouseUnit;
  quantity: string;
  /** Oshpaz so'ragan miqdor — faqat keyin o'zgartirilgan bo'lsa. */
  requestedQuantity: string | null;
  /** Shu qator uchun to'langan jami summa; bo'sh — hali sotib olinmagan. */
  price: string | null;
  /** Faqat ko'rsatish uchun: jami ÷ miqdor. */
  unitPrice: string | null;
  purchasedAt: string | null;
  purchasedByName: string | null;
  /** Sotib olinmadi. */
  skipped: boolean;
  /** Oshpazning shu qatorga izohi. */
  note: string | null;
}

export interface ShoppingList {
  id: string;
  /** Bo'sh bo'lsa — to'yga bog'lanmagan umumiy bozorlik. */
  eventId: string | null;
  status: ShoppingStatus;
  note: string | null;
  createdById: string;
  createdByName: string;
  createdAt: string;
  /** SUPER_ADMIN birinchi marta ko'rgan vaqt. */
  reviewedAt: string | null;
  approvedAt: string | null;
  purchasedAt: string | null;
  purchasedByName: string | null;
  confirmedAt: string | null;
  total: string;
  items: ShoppingItem[];
}

/** Oshxona bosqichi: oshpaz bozorlikni shu tartibda — taom bo'yicha — yozadi. */
export const MENU_COURSES = ['SALAD', 'FIRST_DISH', 'SECOND_DISH', 'OTHER'] as const;
export type MenuCourse = (typeof MENU_COURSES)[number];

export interface KitchenMenuSection {
  nameUz: string;
  nameRu: string;
  course: MenuCourse;
  kindsCount: number;
  items: string[];
}

/** Oshxona uchun tadbir ko'rinishi — pul va mijoz telefoni yo'q. */
export interface KitchenEvent {
  id: string;
  number: number;
  title: string | null;
  type: EventType;
  status: EventStatus;
  startAt: string;
  endAt: string;
  /** Tadbir kuni (`YYYY-MM-DD`, Toshkent). */
  day: string;
  guestCount: number;
  tableCapacity: number | null;
  firstDish: string | null;
  secondDish: string | null;
  clientName: string;
  hallName: string;
  menu: { name: string; sections: KitchenMenuSection[] } | null;
  lists: ShoppingList[];
  /** Barcha ro'yxatlar bo'yicha kiritilgan narxlar yig'indisi. */
  total: string;
}

export interface ListItemPayload {
  id?: string;
  name: string;
  unit: WarehouseUnit;
  quantity: string;
  note?: string | null;
}

export interface ListPayload {
  items: ListItemPayload[];
  note: string | null;
}

/** Bitta mahsulot xaridi: narx — jami (`price`) yoki 1 birlik (`unitPrice`). */
export interface PurchaseItemPayload {
  quantity?: string;
  price?: string;
  unitPrice?: string;
}

/** Sotib olingan yoki "olinmadi" deb belgilangan qator. */
export const isItemDone = (item: ShoppingItem): boolean => item.skipped || item.price !== null;

/** Foydalanuvchidan kutilayotgan ro'yxatlar soni. */
export interface PendingShopping {
  /** Qo'ng'iroqcha uchun: hali ochib ko'rilmagan ro'yxatlar. */
  unseen: number;
  toReview: number;
  toConfirm: number;
  toPurchase: number;
}

/** Oshpaz katalogidagi mahsulot: ombordagi oziq-ovqat yoki ilgari yozilgani. */
export interface CatalogItem {
  name: string;
  unit: WarehouseUnit;
  productCategory: ProductCategory | null;
  photo: { url: string; thumbUrl: string } | null;
}

/** O'zim yozgan ro'yxat — to'yning mehmonlari soni bilan (nusxa olishda moslash uchun). */
export interface MyShoppingList extends ShoppingList {
  event: {
    id: string;
    number: number;
    title: string | null;
    clientName: string;
    startAt: string;
    guestCount: number;
  } | null;
}

export interface ItemSuggestion {
  name: string;
  unit: WarehouseUnit;
}
