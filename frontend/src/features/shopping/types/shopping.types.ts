import type { EventStatus, EventType } from '@/features/events/types/event.types';
import type { WarehouseUnit } from '@/features/warehouse/types/warehouse.types';

export const SHOPPING_STATUSES = ['SUBMITTED', 'APPROVED', 'PURCHASED', 'CONFIRMED'] as const;
export type ShoppingStatus = (typeof SHOPPING_STATUSES)[number];

export interface ShoppingItem {
  id: string;
  name: string;
  unit: WarehouseUnit;
  quantity: string;
  /** Oshpaz so'ragan miqdor — faqat keyin o'zgartirilgan bo'lsa. */
  requestedQuantity: string | null;
  /** Shu qator uchun to'langan jami summa. */
  price: string | null;
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
  approvedAt: string | null;
  purchasedAt: string | null;
  purchasedByName: string | null;
  confirmedAt: string | null;
  total: string;
  items: ShoppingItem[];
}

export interface KitchenMenuSection {
  nameUz: string;
  nameRu: string;
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
  /** Bozorlik qilib bo'lingan — yangi ro'yxat yozilmaydi. */
  shoppingClosed: boolean;
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

export interface PurchasePayload {
  items: { id: string; quantity: string; price?: string; skipped?: boolean }[];
  complete: boolean;
}

/** Foydalanuvchidan kutilayotgan ro'yxatlar soni. */
export interface PendingShopping {
  toReview: number;
  toConfirm: number;
  toPurchase: number;
}

export interface ItemSuggestion {
  name: string;
  unit: WarehouseUnit;
}
