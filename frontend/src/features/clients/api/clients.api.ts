import { http } from '@/lib/api-client';
import type { ListParams } from '@/types/api';
import type { Client, ClientPayload } from '../types/client.types';

export const clientsApi = {
  list: (params: ListParams) => http.list<Client>('/clients', params),
  create: (body: ClientPayload) => http.post<Client>('/clients', body),
  update: (id: string, body: ClientPayload) => http.patch<Client>(`/clients/${id}`, body),
  remove: (id: string) => http.delete(`/clients/${id}`),
};

export const clientKeys = {
  all: ['clients'] as const,
  list: (params: ListParams) => ['clients', 'list', params] as const,
};
