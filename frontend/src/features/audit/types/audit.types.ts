import type { ListParams } from '@/types/api';

export interface AuditLog {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: string;
  actor: { id: string; fullName: string; email: string } | null;
}

export interface ListAuditLogsParams extends ListParams {
  action?: string;
  from?: string;
  to?: string;
}
