import type { AuthRole } from '@/features/auth/types/auth.types';
import type { ListParams } from '@/types/api';

export type UserStatus = 'ACTIVE' | 'BLOCKED';

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: UserStatus;
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  createdAt: string;
  updatedAt: string;
  role: AuthRole;
}

export interface ListUsersParams extends ListParams {
  roleId?: string;
  status?: UserStatus;
}

export interface CreateUserPayload {
  email: string;
  fullName: string;
  phone: string | null;
  roleId: string;
  password: string;
}

export type UpdateUserPayload = Partial<Omit<CreateUserPayload, 'password'>>;
