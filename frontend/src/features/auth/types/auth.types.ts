export interface AuthRole {
  id: string;
  key: string;
  name: string;
}

export interface AuthProfile {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: AuthRole;
  permissions: string[];
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
  /** Bu foydalanuvchi uchun 2FA majburiymi (server sozlamasiga bog'liq). */
  twoFactorRequired: boolean;
  /** Majburiy 2FA hali ulanmagan — ulanmaguncha tizim cheklangan. */
  mustSetupTwoFactor: boolean;
}

export interface AuthSession {
  accessToken: string;
  expiresIn: number;
  user: AuthProfile;
  csrfToken: string;
}

export type LoginResponse =
  | { requiresTwoFactor: true; challengeToken: string }
  | ({ requiresTwoFactor: false } & AuthSession);

export interface TwoFactorSetup {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

export interface TwoFactorStatus {
  enabled: boolean;
  backupCodesRemaining: number;
}

export interface BackupCodes {
  backupCodes: string[];
}

export interface SessionInfo {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  isCurrent?: boolean;
}
