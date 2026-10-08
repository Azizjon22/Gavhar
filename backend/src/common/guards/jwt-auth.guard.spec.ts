import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppConfigService } from '@/config/app-config.service';
import { toAuthProfile } from '@/modules/auth/auth.service';
import { AuthContextService, CachedAuthUser } from '@/modules/auth/services/auth-context.service';
import { SessionsService } from '@/modules/auth/services/sessions.service';
import { TokenService } from '@/modules/auth/services/token.service';
import { ALLOW_RESTRICTED_KEY } from '../decorators/allow-restricted.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

const user = (overrides: Partial<CachedAuthUser> = {}): CachedAuthUser => ({
  id: 'u1',
  email: 'admin@gavhar.uz',
  fullName: 'Gavhar Admin',
  phone: null,
  roleId: 'r0',
  roleKey: 'SUPER_ADMIN',
  roleName: 'Super admin',
  permissions: [],
  mustChangePassword: false,
  twoFactorEnabled: false,
  status: 'ACTIVE',
  ...overrides,
});

const run = (
  cached: CachedAuthUser,
  options: { twoFactorRequired: boolean; allowRestricted?: boolean },
) => {
  const reflector = {
    getAllAndOverride: (key: string) => key === ALLOW_RESTRICTED_KEY && options.allowRestricted,
  } as unknown as Reflector;
  const guard = new JwtAuthGuard(
    reflector,
    {
      verifyAccessToken: () => Promise.resolve({ sub: 'u1', sid: 's1' }),
    } as unknown as TokenService,
    { isRevoked: () => Promise.resolve(false) } as unknown as SessionsService,
    { load: () => Promise.resolve(cached) } as unknown as AuthContextService,
    { auth: { superAdminTwoFactorRequired: options.twoFactorRequired } } as AppConfigService,
  );
  const request = { headers: { authorization: 'Bearer token' } };
  const context = {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return guard.canActivate(context);
};

describe('JwtAuthGuard — SUPER_ADMIN uchun 2FA talabi', () => {
  it('majburiy bo‘lsa, 2FA ulanmagan SUPER_ADMIN tizimga kiritilmaydi', async () => {
    await expect(run(user(), { twoFactorRequired: true })).rejects.toMatchObject({
      code: 'TWO_FACTOR_SETUP_REQUIRED',
    });
  });

  it('majburiy bo‘lsa ham sozlash endpointlari ochiq', async () => {
    await expect(run(user(), { twoFactorRequired: true, allowRestricted: true })).resolves.toBe(
      true,
    );
  });

  it("sozlama o‘chirilgan bo‘lsa, 2FA'siz ham ishlaydi", async () => {
    await expect(run(user(), { twoFactorRequired: false })).resolves.toBe(true);
  });

  it('parolni almashtirish talabi sozlamadan qat’i nazar saqlanadi', async () => {
    await expect(
      run(user({ mustChangePassword: true }), { twoFactorRequired: false }),
    ).rejects.toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });
  });

  it('boshqa rollar uchun 2FA hech qachon majburiy emas', async () => {
    await expect(run(user({ roleKey: 'ADMIN' }), { twoFactorRequired: true })).resolves.toBe(true);
  });
});

describe('toAuthProfile', () => {
  it('majburiy rejimda: twoFactorRequired va mustSetupTwoFactor', () => {
    expect(toAuthProfile(user(), true)).toMatchObject({
      twoFactorRequired: true,
      mustSetupTwoFactor: true,
    });
    expect(toAuthProfile(user({ twoFactorEnabled: true }), true)).toMatchObject({
      twoFactorRequired: true,
      mustSetupTwoFactor: false,
    });
  });

  it('ixtiyoriy rejimda SUPER_ADMIN ham cheklanmaydi', () => {
    expect(toAuthProfile(user(), false)).toMatchObject({
      twoFactorRequired: false,
      mustSetupTwoFactor: false,
    });
  });
});
