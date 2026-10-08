import { Request } from 'express';

/** Guard tomonidan `request.user` ga qo'yiladigan, autentifikatsiyadan o'tgan foydalanuvchi. */
export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  roleId: string;
  roleKey: string;
  roleName: string;
  permissions: string[];
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
  sessionId: string;
}

export type AuthenticatedRequest = Request & { user: AuthUser };
