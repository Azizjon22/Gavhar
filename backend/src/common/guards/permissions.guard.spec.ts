import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { SUPER_ADMIN_ONLY_KEY } from '../decorators/super-admin-only.decorator';
import { PermissionsGuard } from './permissions.guard';

const run = (
  metadata: Record<string, unknown>,
  user: { roleKey: string; permissions: string[] },
): boolean => {
  const reflector = {
    getAllAndOverride: (key: string) => metadata[key],
  } as unknown as Reflector;
  const context = {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return new PermissionsGuard(reflector).canActivate(context);
};

const cashier = { roleKey: 'CUSTOM_KASSIR', permissions: ['finance:read', 'finance:create'] };
const superAdmin = { roleKey: 'SUPER_ADMIN', permissions: [] };

describe('PermissionsGuard', () => {
  it('talab belgilanmagan endpoint har qanday foydalanuvchiga ochiq', () => {
    expect(run({}, cashier)).toBe(true);
  });

  it('public endpointda foydalanuvchi tekshirilmaydi', () => {
    expect(run({ [IS_PUBLIC_KEY]: true, [SUPER_ADMIN_ONLY_KEY]: true }, cashier)).toBe(true);
  });

  it("barcha talab qilingan ruxsatlar bo'lsa o'tkazadi", () => {
    expect(run({ [PERMISSIONS_KEY]: ['finance:read', 'finance:create'] }, cashier)).toBe(true);
  });

  it("bitta ruxsat yetishmasa ham rad etadi va qaysi biri yo'qligini aytadi", () => {
    expect(() => run({ [PERMISSIONS_KEY]: ['finance:read', 'finance:delete'] }, cashier)).toThrow(
      expect.objectContaining({
        status: 403,
        response: expect.objectContaining({ details: { missingPermissions: ['finance:delete'] } }),
      }),
    );
  });

  it('SUPER_ADMIN har qanday ruxsat talabidan o‘tadi', () => {
    expect(run({ [PERMISSIONS_KEY]: ['menu:delete'] }, superAdmin)).toBe(true);
    expect(run({ [SUPER_ADMIN_ONLY_KEY]: true }, superAdmin)).toBe(true);
  });

  it('faqat SUPER_ADMIN endpointiga boshqa rol kira olmaydi', () => {
    expect(() => run({ [SUPER_ADMIN_ONLY_KEY]: true }, cashier)).toThrow(
      expect.objectContaining({ status: 403 }),
    );
  });
});
