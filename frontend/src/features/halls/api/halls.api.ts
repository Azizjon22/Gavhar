import { http } from '@/lib/api-client';
import type { Hall, HallPayload } from '../types/hall.types';

export const hallsApi = {
  list: () => http.get<Hall[]>('/halls'),
  create: (body: HallPayload) => http.post<Hall>('/halls', body),
  update: (id: string, body: HallPayload) => http.patch<Hall>(`/halls/${id}`, body),
  remove: (id: string) => http.delete(`/halls/${id}`),

  uploadImage: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    // Katta rasm sekin tarmoqda uzoq yuklanishi mumkin.
    return http.post<Hall>(`/halls/${id}/images`, form, { timeout: 120_000 });
  },
  removeImage: (id: string, imageId: string) => http.delete<Hall>(`/halls/${id}/images/${imageId}`),
  reorderImages: (id: string, imageIds: string[]) =>
    http.put<Hall>(`/halls/${id}/images/order`, { imageIds }),
};

export const hallKeys = {
  all: ['halls'] as const,
  list: ['halls', 'list'] as const,
};
