export interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  usersCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PermissionGroup {
  resource: string;
  permissions: { key: string; action: string; description: string }[];
}

export interface RolePayload {
  name: string;
  description: string | null;
  permissions: string[];
}

export const SUPER_ADMIN_KEY = 'SUPER_ADMIN';
