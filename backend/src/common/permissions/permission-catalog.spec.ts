import {
  ALL_PERMISSION_KEYS,
  DEFAULT_ADMIN_PERMISSIONS,
  PERMISSION_CATALOG,
  isPermissionKey,
} from './permission-catalog';

describe('permission-catalog', () => {
  it('barcha kalitlar `resource:action` formatida va takrorlanmaydi', () => {
    for (const { key, resource, action } of PERMISSION_CATALOG) {
      expect(key).toBe(`${resource}:${action}`);
      expect(key).toMatch(/^[a-z-]+:[a-z-]+$/);
    }
    expect(new Set(ALL_PERMISSION_KEYS).size).toBe(ALL_PERMISSION_KEYS.length);
  });

  it('foydalanuvchi, rol va audit boshqaruvi hech qanday rolga berilmaydi', () => {
    const resources = new Set(PERMISSION_CATALOG.map((p) => p.resource));

    expect(resources.has('users')).toBe(false);
    expect(resources.has('roles')).toBe(false);
    expect(resources.has('audit')).toBe(false);
  });

  it('ADMIN standart holatda pulni ko‘rmaydi: moliya ruxsatlari berilmaydi', () => {
    expect(DEFAULT_ADMIN_PERMISSIONS.filter((key) => key.startsWith('finance:'))).toEqual([]);
    expect(DEFAULT_ADMIN_PERMISSIONS).toEqual(
      expect.arrayContaining([
        'events:create',
        'shopping:purchase',
        'warehouse:update',
        'staff:update',
      ]),
    );
  });

  it("noma'lum kalitni tanimaydi", () => {
    expect(isPermissionKey('menu:update')).toBe(true);
    expect(isPermissionKey('users:delete')).toBe(false);
  });
});
