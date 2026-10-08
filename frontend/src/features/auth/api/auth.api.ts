import { http } from '@/lib/api-client';
import type {
  AuthSession,
  BackupCodes,
  LoginResponse,
  SessionInfo,
  TwoFactorSetup,
  TwoFactorStatus,
} from '../types/auth.types';

export const authApi = {
  login: (body: { email: string; password: string }) =>
    http.post<LoginResponse>('/auth/login', body),

  verifyTwoFactor: (body: { challengeToken: string; code: string }) =>
    http.post<AuthSession>('/auth/2fa/verify', body),

  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    http.post('/auth/change-password', body),

  twoFactorStatus: () => http.get<TwoFactorStatus>('/auth/2fa/status'),
  twoFactorSetup: () => http.post<TwoFactorSetup>('/auth/2fa/setup'),
  twoFactorEnable: (code: string) => http.post<BackupCodes>('/auth/2fa/enable', { code }),
  twoFactorDisable: (body: { password: string; code: string }) =>
    http.post('/auth/2fa/disable', body),
  regenerateBackupCodes: (code: string) =>
    http.post<BackupCodes>('/auth/2fa/backup-codes', { code }),

  sessions: () => http.get<SessionInfo[]>('/auth/sessions'),
  revokeSession: (id: string) => http.delete(`/auth/sessions/${id}`),
  revokeOtherSessions: () => http.delete<{ revoked: number }>('/auth/sessions'),
};

export const authKeys = {
  twoFactorStatus: ['auth', '2fa-status'] as const,
  sessions: ['auth', 'sessions'] as const,
};
