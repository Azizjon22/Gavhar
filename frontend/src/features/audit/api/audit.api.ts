import { http } from '@/lib/api-client';
import type { AuditLog, ListAuditLogsParams } from '../types/audit.types';

export const auditApi = {
  list: (params: ListAuditLogsParams) => http.list<AuditLog>('/audit-logs', params),
};

export const auditKeys = {
  list: (params: ListAuditLogsParams) => ['audit-logs', params] as const,
};
