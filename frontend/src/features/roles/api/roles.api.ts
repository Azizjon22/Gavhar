import { http } from '@/lib/api-client';
import type { PermissionGroup, Role, RolePayload } from '../types/role.types';

export const rolesApi = {
  list: () => http.get<Role[]>('/roles'),
  permissionCatalog: () => http.get<PermissionGroup[]>('/permissions'),
  create: (body: RolePayload) => http.post<Role>('/roles', body),
  update: (id: string, body: Partial<RolePayload>) => http.patch<Role>(`/roles/${id}`, body),
  remove: (id: string) => http.delete(`/roles/${id}`),
};

export const roleKeys = {
  all: ['roles'] as const,
  list: ['roles', 'list'] as const,
  permissionCatalog: ['roles', 'permission-catalog'] as const,
};
