import { http } from '@/lib/api-client';
import type {
  CatalogItem,
  ItemSuggestion,
  KitchenEvent,
  ListPayload,
  MyShoppingList,
  PendingShopping,
  PurchaseItemPayload,
  ShoppingList,
} from '../types/shopping.types';

export const shoppingApi = {
  events: (range: { from: string; to: string }) =>
    http.get<KitchenEvent[]>('/shopping/events', { params: range }),
  suggestions: () => http.get<ItemSuggestion[]>('/shopping/suggestions'),
  catalog: () => http.get<CatalogItem[]>('/shopping/catalog'),
  mine: () => http.get<MyShoppingList[]>('/shopping/lists/mine'),

  /** `eventId` bo'sh bo'lsa — umumiy (to'yga bog'lanmagan) ro'yxat. */
  create: (eventId: string | null, body: ListPayload) =>
    http.post<ShoppingList>(
      eventId ? `/shopping/events/${eventId}/lists` : '/shopping/lists',
      body,
    ),
  general: () => http.get<ShoppingList[]>('/shopping/lists/general'),
  pending: () => http.get<PendingShopping>('/shopping/pending'),
  /** Bozorlik sahifasi ochildi — yangi ro'yxatlar "ko'rildi" bo'ladi. */
  markSeen: () => http.post<void>('/shopping/seen'),
  update: (id: string, body: ListPayload) => http.put<ShoppingList>(`/shopping/lists/${id}`, body),
  approve: (id: string) => http.post<ShoppingList>(`/shopping/lists/${id}/approve`),
  purchaseItem: (id: string, itemId: string, body: PurchaseItemPayload) =>
    http.post<ShoppingList>(`/shopping/lists/${id}/items/${itemId}/purchase`, body),
  skipItem: (id: string, itemId: string) =>
    http.post<ShoppingList>(`/shopping/lists/${id}/items/${itemId}/skip`),
  resetItem: (id: string, itemId: string) =>
    http.post<ShoppingList>(`/shopping/lists/${id}/items/${itemId}/reset`),
  fixItemPrice: (id: string, itemId: string, body: { price?: string; unitPrice?: string }) =>
    http.patch<ShoppingList>(`/shopping/lists/${id}/items/${itemId}/price`, body),
  confirm: (id: string) => http.post<ShoppingList>(`/shopping/lists/${id}/confirm`),
  unconfirm: (id: string) => http.post<ShoppingList>(`/shopping/lists/${id}/unconfirm`),
  remove: (id: string) => http.delete(`/shopping/lists/${id}`),
  pdfUrl: (id: string) => `/shopping/lists/${id}/pdf`,
};

export const shoppingKeys = {
  all: ['shopping'] as const,
  events: (range: { from: string; to: string }) => ['shopping', 'events', range] as const,
  suggestions: ['shopping', 'suggestions'] as const,
  catalog: ['shopping', 'catalog'] as const,
  mine: ['shopping', 'mine'] as const,
  general: ['shopping', 'general'] as const,
  pending: ['shopping', 'pending'] as const,
};
