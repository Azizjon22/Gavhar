import { http } from '@/lib/api-client';
import type {
  ItemSuggestion,
  KitchenEvent,
  ListPayload,
  PendingShopping,
  PurchasePayload,
  ShoppingList,
} from '../types/shopping.types';

export const shoppingApi = {
  events: (range: { from: string; to: string }) =>
    http.get<KitchenEvent[]>('/shopping/events', { params: range }),
  suggestions: () => http.get<ItemSuggestion[]>('/shopping/suggestions'),

  /** `eventId` bo'sh bo'lsa — umumiy (to'yga bog'lanmagan) ro'yxat. */
  create: (eventId: string | null, body: ListPayload) =>
    http.post<ShoppingList>(
      eventId ? `/shopping/events/${eventId}/lists` : '/shopping/lists',
      body,
    ),
  general: () => http.get<ShoppingList[]>('/shopping/lists/general'),
  pending: () => http.get<PendingShopping>('/shopping/pending'),
  update: (id: string, body: ListPayload) => http.put<ShoppingList>(`/shopping/lists/${id}`, body),
  approve: (id: string) => http.post<ShoppingList>(`/shopping/lists/${id}/approve`),
  purchase: (id: string, body: PurchasePayload) =>
    http.put<ShoppingList>(`/shopping/lists/${id}/purchase`, body),
  confirm: (id: string) => http.post<ShoppingList>(`/shopping/lists/${id}/confirm`),
  unconfirm: (id: string) => http.post<ShoppingList>(`/shopping/lists/${id}/unconfirm`),
  remove: (id: string) => http.delete(`/shopping/lists/${id}`),
  pdfUrl: (id: string) => `/shopping/lists/${id}/pdf`,
};

export const shoppingKeys = {
  all: ['shopping'] as const,
  events: (range: { from: string; to: string }) => ['shopping', 'events', range] as const,
  suggestions: ['shopping', 'suggestions'] as const,
  general: ['shopping', 'general'] as const,
  pending: ['shopping', 'pending'] as const,
};
