import { http } from '@/lib/api-client';
import type { EventWorker, Worker, WorkerPayload } from '../types/worker.types';

export const workersApi = {
  list: () => http.get<Worker[]>('/workers'),
  create: (body: WorkerPayload) => http.post<Worker>('/workers', body),
  update: (id: string, body: Partial<WorkerPayload>) => http.patch<Worker>(`/workers/${id}`, body),
  remove: (id: string) => http.delete(`/workers/${id}`),
  uploadPhoto: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return http.post<Worker>(`/workers/${id}/photo`, form, { timeout: 120_000 });
  },
  removePhoto: (id: string) => http.delete<Worker>(`/workers/${id}/photo`),

  forEvent: (eventId: string) => http.get<EventWorker[]>(`/events/${eventId}/workers`),
  assign: (eventId: string, body: { workerId: string; roleAtEvent: string | null }) =>
    http.post<EventWorker[]>(`/events/${eventId}/workers`, body),
  unassign: (eventId: string, workerId: string) =>
    http.delete<EventWorker[]>(`/events/${eventId}/workers/${workerId}`),
};

export const workerKeys = {
  all: ['workers'] as const,
  list: ['workers', 'list'] as const,
  event: (eventId: string) => ['workers', 'event', eventId] as const,
};
