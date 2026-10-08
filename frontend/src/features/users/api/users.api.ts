import type { SessionInfo } from '@/features/auth/types/auth.types';
import { http } from '@/lib/api-client';
import type {
  CreateUserPayload,
  ListUsersParams,
  UpdateUserPayload,
  User,
} from '../types/user.types';

export const usersApi = {
  list: (params: ListUsersParams) => http.list<User>('/users', params),
  create: (body: CreateUserPayload) => http.post<User>('/users', body),
  update: (id: string, body: UpdateUserPayload) => http.patch<User>(`/users/${id}`, body),
  block: (id: string) => http.post<User>(`/users/${id}/block`),
  unblock: (id: string) => http.post<User>(`/users/${id}/unblock`),
  resetPassword: (id: string, newPassword: string) =>
    http.post(`/users/${id}/reset-password`, { newPassword }),
  resetTwoFactor: (id: string) => http.post(`/users/${id}/reset-2fa`),
  remove: (id: string) => http.delete(`/users/${id}`),

  sessions: (id: string) => http.get<SessionInfo[]>(`/users/${id}/sessions`),
  revokeSession: (id: string, sessionId: string) =>
    http.delete(`/users/${id}/sessions/${sessionId}`),
  revokeAllSessions: (id: string) => http.delete<{ revoked: number }>(`/users/${id}/sessions`),
};

export const userKeys = {
  all: ['users'] as const,
  list: (params: ListUsersParams) => ['users', 'list', params] as const,
  sessions: (id: string) => ['users', 'sessions', id] as const,
};
