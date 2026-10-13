import { http } from '@/lib/api-client';
import type {
  CreateItemPayload,
  ItemPayload,
  MovementPayload,
  RecentMovement,
  StockItem,
  StockMovement,
  StockUsage,
  TakeStockPayload,
  WarehouseItem,
} from '../types/warehouse.types';

export const warehouseApi = {
  items: () => http.get<WarehouseItem[]>('/warehouse/items'),
  create: (body: CreateItemPayload) => http.post<WarehouseItem>('/warehouse/items', body),
  update: (id: string, body: ItemPayload) =>
    http.patch<WarehouseItem>(`/warehouse/items/${id}`, body),
  remove: (id: string) => http.delete(`/warehouse/items/${id}`),

  addMovement: (id: string, body: MovementPayload) =>
    http.post<WarehouseItem>(`/warehouse/items/${id}/movements`, body),
  count: (id: string, body: { actual: string; note: string | null }) =>
    http.post<WarehouseItem>(`/warehouse/items/${id}/count`, body),
  recentMovements: () =>
    http.get<RecentMovement[]>('/warehouse/items/recent-movements', { params: { limit: 30 } }),
  uploadPhoto: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return http.post<WarehouseItem>(`/warehouse/items/${id}/photo`, form, { timeout: 120_000 });
  },
  removePhoto: (id: string) => http.delete<WarehouseItem>(`/warehouse/items/${id}/photo`),
  movements: (id: string, page: number) =>
    http.list<StockMovement>(`/warehouse/items/${id}/movements`, { page, limit: 10 }),

  /** Partiyaga 1 birlik narxi (faqat SUPER_ADMIN). */
  setLotPrice: (lotId: string, unitPrice: string) =>
    http.patch<WarehouseItem>(`/warehouse/lots/${lotId}`, { unitPrice }),

  // To'y uchun ombordan olish (oshpaz) va olinganlar.
  stock: () => http.get<StockItem[]>('/warehouse/stock'),
  take: (body: TakeStockPayload) => http.post<StockUsage>('/warehouse/usages', body),
  myUsages: () => http.get<StockUsage[]>('/warehouse/usages/mine'),
  usages: () => http.get<StockUsage[]>('/warehouse/usages'),
  eventUsages: (eventId: string) => http.get<StockUsage[]>(`/warehouse/usages/event/${eventId}`),
  giveBack: (usageId: string) => http.delete(`/warehouse/usages/${usageId}`),
};

export const warehouseKeys = {
  all: ['warehouse'] as const,
  items: ['warehouse', 'items'] as const,
  recent: ['warehouse', 'recent'] as const,
  movements: (id: string, page: number) => ['warehouse', 'movements', id, page] as const,
  stock: ['warehouse', 'stock'] as const,
  usages: ['warehouse', 'usages'] as const,
  myUsages: ['warehouse', 'usages', 'mine'] as const,
  eventUsages: (eventId: string) => ['warehouse', 'usages', 'event', eventId] as const,
};
