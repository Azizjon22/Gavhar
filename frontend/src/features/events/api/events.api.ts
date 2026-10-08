import { http } from '@/lib/api-client';
import type {
  BookingSettings,
  EventDetail,
  EventPayload,
  EventSummary,
  ListEventsParams,
  PaymentPayload,
} from '../types/event.types';

export type EventTransition = 'confirm' | 'hold' | 'complete';

export const eventsApi = {
  list: (params: ListEventsParams) => http.list<EventSummary>('/events', params),
  calendar: (from: string, to: string) =>
    http.get<EventSummary[]>('/events/calendar', { params: { from, to } }),
  get: (id: string) => http.get<EventDetail>(`/events/${id}`),
  create: (body: EventPayload) => http.post<EventDetail>('/events', body),
  update: (id: string, body: EventPayload) => http.patch<EventDetail>(`/events/${id}`, body),
  remove: (id: string) => http.delete(`/events/${id}`),

  transition: (id: string, action: EventTransition) =>
    http.post<EventDetail>(`/events/${id}/${action}`),
  cancel: (id: string, reason: string) =>
    http.post<EventDetail>(`/events/${id}/cancel`, { reason }),

  addPayment: (id: string, body: PaymentPayload) =>
    http.post<EventDetail>(`/events/${id}/payments`, body),
  voidPayment: (id: string, paymentId: string) =>
    http.delete<EventDetail>(`/events/${id}/payments/${paymentId}`),

  contractUrl: (id: string) => `/events/${id}/contract`,
  receiptUrl: (id: string, paymentId: string) => `/events/${id}/payments/${paymentId}/receipt`,
};

export const bookingSettingsApi = {
  get: () => http.get<BookingSettings>('/settings/booking'),
  update: (body: BookingSettings) => http.put<BookingSettings>('/settings/booking', body),
};

export const eventKeys = {
  all: ['events'] as const,
  list: (params: ListEventsParams) => ['events', 'list', params] as const,
  calendar: (from: string, to: string) => ['events', 'calendar', from, to] as const,
  detail: (id: string) => ['events', 'detail', id] as const,
  bookingSettings: ['settings', 'booking'] as const,
};
