import { http } from '@/lib/api-client';
import type { ExtraService, ExtraServicePayload } from '../types/extra-service.types';

export const extraServicesApi = {
  list: () => http.get<ExtraService[]>('/extra-services'),
  create: (body: ExtraServicePayload) => http.post<ExtraService>('/extra-services', body),
  update: (id: string, body: Partial<ExtraServicePayload>) =>
    http.patch<ExtraService>(`/extra-services/${id}`, body),
  remove: (id: string) => http.delete(`/extra-services/${id}`),
};

export const extraServiceKeys = {
  all: ['extra-services'] as const,
  list: ['extra-services', 'list'] as const,
};
