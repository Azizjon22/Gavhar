import { describe, expect, it } from 'vitest';
import { requiredSetupPath } from '@/app/router/guards';
import { ROUTES } from '@/app/router/paths';
import type { AuthProfile } from '@/features/auth/types/auth.types';
import { hasPermissions, isSuperAdmin } from './auth.store';

const profile = (overrides: Partial<AuthProfile> = {}): AuthProfile => ({
  id: 'u1',
  email: 'kassir@gavhar.uz',
  fullName: 'Kassir Aka',
  phone: null,
  role: { id: 'r1', key: 'CUSTOM_KASSIR', name: 'Kassir' },
  permissions: ['finance:read', 'finance:create'],
  mustChangePassword: false,
  twoFactorEnabled: false,
  twoFactorRequired: false,
  mustSetupTwoFactor: false,
  ...overrides,
});

const superAdmin = profile({
  role: { id: 'r0', key: 'SUPER_ADMIN', name: 'Super admin' },
  permissions: [],
});

describe('hasPermissions', () => {
  it("barcha so'ralgan ruxsatlar bo'lsagina true", () => {
    expect(hasPermissions(profile(), 'finance:read')).toBe(true);
    expect(hasPermissions(profile(), 'finance:read', 'finance:create')).toBe(true);
    expect(hasPermissions(profile(), 'finance:read', 'finance:delete')).toBe(false);
  });

  it('SUPER_ADMIN har qanday ruxsatga ega', () => {
    expect(isSuperAdmin(superAdmin)).toBe(true);
    expect(hasPermissions(superAdmin, 'menu:delete')).toBe(true);
  });

  it("kirmagan foydalanuvchida ruxsat yo'q", () => {
    expect(hasPermissions(null, 'finance:read')).toBe(false);
    expect(isSuperAdmin(null)).toBe(false);
  });
});

describe('requiredSetupPath', () => {
  it('avval parol, keyin 2FA', () => {
    expect(requiredSetupPath(profile({ mustChangePassword: true, mustSetupTwoFactor: true }))).toBe(
      ROUTES.setupPassword,
    );
    expect(requiredSetupPath(profile({ mustSetupTwoFactor: true }))).toBe(ROUTES.setupTwoFactor);
  });

  it("cheklov bo'lmasa null", () => {
    expect(requiredSetupPath(profile())).toBeNull();
  });
});
