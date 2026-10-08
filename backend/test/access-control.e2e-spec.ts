import sharp from 'sharp';
import { UsersService } from '../src/modules/users/users.service';
import {
  ActiveSuperAdmin,
  NEW_PASSWORD,
  SUPER_ADMIN,
  TEMP_PASSWORD,
  TestApp,
} from './utils/test-app';

describe('Foydalanuvchilar, rollar va audit (e2e)', () => {
  let t: TestApp;
  let admin: ActiveSuperAdmin;

  beforeAll(async () => {
    t = await TestApp.create();
  });

  beforeEach(async () => {
    await t.reset();
    admin = await t.activateSuperAdmin();
    await t.clearRateLimits();
  });

  afterAll(async () => {
    await t.close();
  });

  const createRole = async (name: string, permissions: string[]) => {
    const res = await t
      .http()
      .post('/api/v1/roles')
      .set(admin.auth)
      .send({ name, permissions })
      .expect(201);
    return res.body.data as { id: string; key: string; permissions: string[] };
  };

  describe('rollar', () => {
    it("ruxsatlar katalogi resurs bo'yicha guruhlangan", async () => {
      const res = await t.http().get('/api/v1/permissions').set(admin.auth).expect(200);
      const resources = res.body.data.map((group: { resource: string }) => group.resource);

      expect(resources).toEqual(
        expect.arrayContaining(['events', 'finance', 'menu', 'warehouse', 'media']),
      );
      expect(resources).not.toEqual(expect.arrayContaining(['users']));
    });

    it('custom rol yaratiladi, tahrirlanadi va o‘chiriladi', async () => {
      const role = await createRole('Omborchi', ['warehouse:read', 'warehouse:create']);
      expect(role.key).toMatch(/^CUSTOM_OMBORCHI_/);

      const updated = await t
        .http()
        .patch(`/api/v1/roles/${role.id}`)
        .set(admin.auth)
        .send({ permissions: ['warehouse:read'] })
        .expect(200);
      expect(updated.body.data.permissions).toEqual(['warehouse:read']);

      await t.http().delete(`/api/v1/roles/${role.id}`).set(admin.auth).expect(204);
      await t.http().get(`/api/v1/roles/${role.id}`).set(admin.auth).expect(404);
    });

    it("noma'lum ruxsat va takroriy nom rad etiladi", async () => {
      await t
        .http()
        .post('/api/v1/roles')
        .set(admin.auth)
        .send({ name: 'Xaker', permissions: ['users:delete'] })
        .expect(400);

      await createRole('Kassir', ['finance:read']);
      const duplicate = await t
        .http()
        .post('/api/v1/roles')
        .set(admin.auth)
        .send({ name: 'kassir', permissions: [] })
        .expect(409);
      expect(duplicate.body.error.code).toBe('ROLE_NAME_TAKEN');
    });

    it("tizim rollari himoyalangan, band rol o'chirilmaydi", async () => {
      const superAdminRoleId = await t.roleId('SUPER_ADMIN');
      const adminRoleId = await t.roleId('ADMIN');

      await t
        .http()
        .patch(`/api/v1/roles/${superAdminRoleId}`)
        .set(admin.auth)
        .send({ permissions: [] })
        .expect(400);
      await t.http().delete(`/api/v1/roles/${adminRoleId}`).set(admin.auth).expect(400);

      const role = await createRole('Fotograf', ['media:read']);
      await t.createActiveUser(admin, {
        email: 'foto@gavhar.test',
        fullName: 'Foto Graf',
        roleId: role.id,
      });
      const inUse = await t.http().delete(`/api/v1/roles/${role.id}`).set(admin.auth).expect(409);
      expect(inUse.body.error.code).toBe('ROLE_IN_USE');
    });
  });

  describe('custom rolli foydalanuvchi', () => {
    it("faqat o'z ruxsatlarini oladi va boshqaruv bo'limlariga kira olmaydi", async () => {
      const role = await createRole('Kassir', ['finance:read', 'finance:create']);
      const cashier = await t.createActiveUser(admin, {
        email: 'kassir@gavhar.test',
        fullName: 'Kassir Aka',
        roleId: role.id,
      });

      const me = await cashier.agent.get('/api/v1/auth/me').set(cashier.auth).expect(200);
      expect(me.body.data.permissions).toEqual(['finance:create', 'finance:read']);
      expect(me.body.data.mustSetupTwoFactor).toBe(false);

      for (const path of ['/users', '/roles', '/permissions', '/audit-logs']) {
        const res = await cashier.agent.get(`/api/v1${path}`).set(cashier.auth).expect(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      }
      await cashier.agent
        .post('/api/v1/users')
        .set(cashier.auth)
        .send({
          email: 'x@gavhar.test',
          fullName: 'X Y',
          roleId: await t.roleId('SUPER_ADMIN'),
          password: TEMP_PASSWORD,
        })
        .expect(403);
    });

    it("rol ruxsatlari o'zgarsa, foydalanuvchi darhol yangisini oladi", async () => {
      const role = await createRole('Menejer', ['events:read']);
      const manager = await t.createActiveUser(admin, {
        email: 'menejer@gavhar.test',
        fullName: 'Menejer Opa',
        roleId: role.id,
      });

      await t
        .http()
        .patch(`/api/v1/roles/${role.id}`)
        .set(admin.auth)
        .send({ permissions: ['events:read', 'events:create'] })
        .expect(200);

      const me = await manager.agent.get('/api/v1/auth/me').set(manager.auth).expect(200);
      expect(me.body.data.permissions).toEqual(['events:create', 'events:read']);
    });
  });

  describe('foydalanuvchilarni boshqarish', () => {
    it('yaratilgan foydalanuvchi birinchi kirishda parolni almashtirishi shart', async () => {
      const created = await t
        .http()
        .post('/api/v1/users')
        .set(admin.auth)
        .send({
          email: '  Yangi@Gavhar.Test ',
          fullName: 'Yangi Xodim',
          phone: '+998901234567',
          roleId: await t.roleId('ADMIN'),
          password: TEMP_PASSWORD,
        })
        .expect(201);

      expect(created.body.data).toMatchObject({
        email: 'yangi@gavhar.test',
        mustChangePassword: true,
        role: { key: 'ADMIN' },
      });
      expect(created.body.data).not.toHaveProperty('passwordHash');
      expect(created.body.data).not.toHaveProperty('totpSecretEnc');

      const session = await t.login('yangi@gavhar.test', TEMP_PASSWORD);
      const me = await session.agent.get('/api/v1/auth/me').set(session.auth).expect(200);
      expect(me.body.data.mustChangePassword).toBe(true);
    });

    it("validatsiya: takroriy email, zaif parol, noto'g'ri telefon, ortiqcha maydon", async () => {
      const roleId = await t.roleId('ADMIN');
      const base = { fullName: 'Test Xodim', roleId, password: TEMP_PASSWORD };
      const post = (body: object) => t.http().post('/api/v1/users').set(admin.auth).send(body);

      const duplicate = await post({ ...base, email: SUPER_ADMIN.email }).expect(409);
      expect(duplicate.body.error.code).toBe('EMAIL_TAKEN');

      await post({ ...base, email: 'a@gavhar.test', password: 'zaifparol' }).expect(400);
      await post({ ...base, email: 'b@gavhar.test', phone: '901234567' }).expect(400);
      await post({ ...base, email: 'c@gavhar.test', status: 'ACTIVE', isSystem: true }).expect(400);
    });

    it('bloklangan foydalanuvchi darhol tizimdan chiqariladi va qayta kira olmaydi', async () => {
      const user = await t.createActiveUser(admin, {
        email: 'xodim@gavhar.test',
        fullName: 'Xodim Bir',
        roleId: await t.roleId('ADMIN'),
      });
      await user.agent.get('/api/v1/auth/me').set(user.auth).expect(200);

      await t.http().post(`/api/v1/users/${user.id}/block`).set(admin.auth).expect(200);

      await user.agent.get('/api/v1/auth/me').set(user.auth).expect(401);
      const login = await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: 'xodim@gavhar.test', password: NEW_PASSWORD })
        .expect(403);
      expect(login.body.error.code).toBe('ACCOUNT_BLOCKED');

      await t.http().post(`/api/v1/users/${user.id}/unblock`).set(admin.auth).expect(200);
      await t.login('xodim@gavhar.test', NEW_PASSWORD);
    });

    it("parol tiklanganda sessiyalar yopiladi va yangi parol vaqtinchalik bo'ladi", async () => {
      const user = await t.createActiveUser(admin, {
        email: 'xodim@gavhar.test',
        fullName: 'Xodim Bir',
        roleId: await t.roleId('ADMIN'),
      });

      await t
        .http()
        .post(`/api/v1/users/${user.id}/reset-password`)
        .set(admin.auth)
        .send({ newPassword: 'Tiklangan!2026dD' })
        .expect(204);

      await user.agent.get('/api/v1/auth/me').set(user.auth).expect(401);
      const session = await t.login('xodim@gavhar.test', 'Tiklangan!2026dD');
      const me = await session.agent.get('/api/v1/auth/me').set(session.auth).expect(200);
      expect(me.body.data.mustChangePassword).toBe(true);
    });

    it('parolini unutib bloklangan xodim tiklangan parol bilan darhol kiradi', async () => {
      const user = await t.createActiveUser(admin, {
        email: 'unutgan@gavhar.test',
        fullName: 'Unutgan Oshpaz',
        roleId: await t.roleId('COOK'),
      });
      const attempt = (password: string) =>
        t.http().post('/api/v1/auth/login').send({ email: 'unutgan@gavhar.test', password });

      for (let i = 0; i < 4; i++) await attempt('Esimda!Yoq12345').expect(401);
      await attempt('Esimda!Yoq12345').expect(429);
      // Bloklangan paytda to'g'ri parol ham o'tmaydi.
      await attempt(NEW_PASSWORD).expect(429);

      await t
        .http()
        .post(`/api/v1/users/${user.id}/reset-password`)
        .set(admin.auth)
        .send({ newPassword: 'Tiklangan!2026dD' })
        .expect(204);

      // Eski parol endi yaroqsiz; yangisi bilan kutmasdan kiradi va almashtirishi shart.
      await attempt(NEW_PASSWORD).expect(401);
      const session = await t.login('unutgan@gavhar.test', 'Tiklangan!2026dD');
      const me = await session.agent.get('/api/v1/auth/me').set(session.auth).expect(200);
      expect(me.body.data.mustChangePassword).toBe(true);
      // Parolni almashtirmaguncha boshqa bo'limlarga kira olmaydi.
      const blocked = await session.agent
        .get('/api/v1/shopping/suggestions')
        .set(session.auth)
        .expect(403);
      expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    });

    it('brend: nom va logotipni faqat SUPER_ADMIN o‘zgartiradi; kirish sahifasi uchun ochiq o‘qiladi', async () => {
      const anonymous = await t.http().get('/api/v1/settings/brand').expect(200);
      expect(anonymous.body.data).toEqual({ name: 'Gavhar', logo: null });

      const renamed = await t
        .http()
        .put('/api/v1/settings/brand')
        .set(admin.auth)
        .send({ name: '  Gavhar Saroy ' })
        .expect(200);
      expect(renamed.body.data.name).toBe('Gavhar Saroy');
      await t.http().put('/api/v1/settings/brand').set(admin.auth).send({ name: 'G' }).expect(400);

      const png = await sharp({
        create: {
          width: 400,
          height: 400,
          channels: 4,
          background: { r: 201, g: 162, b: 75, alpha: 0.5 },
        },
      })
        .png()
        .toBuffer();
      const withLogo = await t
        .http()
        .post('/api/v1/settings/brand/logo')
        .set(admin.auth)
        .attach('file', png, { filename: 'logo.png', contentType: 'image/png' })
        .expect(201);
      expect((await fetch(withLogo.body.data.logo.url)).status).toBe(200);
      expect((await t.http().get('/api/v1/settings/brand').expect(200)).body.data).toMatchObject({
        name: 'Gavhar Saroy',
        logo: { url: expect.stringContaining('.webp') },
      });

      const user = await t.createActiveUser(admin, {
        email: 'xodim3@gavhar.test',
        fullName: 'Xodim Uch',
        roleId: await t.roleId('ADMIN'),
      });
      await user.agent
        .put('/api/v1/settings/brand')
        .set(user.auth)
        .send({ name: 'Boshqa' })
        .expect(403);
      await user.agent.delete('/api/v1/settings/brand/logo').set(user.auth).expect(403);

      const cleared = await t
        .http()
        .delete('/api/v1/settings/brand/logo')
        .set(admin.auth)
        .expect(200);
      expect(cleared.body.data.logo).toBeNull();
      await t.http().delete('/api/v1/settings/brand/logo').set(admin.auth).expect(404);
    });

    it('server konsolidan tiklash: yagona SUPER_ADMIN ham parolini qaytarib oladi', async () => {
      const users = t.app.get(UsersService);
      await expect(users.recoverAccess('yoq@gavhar.test')).rejects.toMatchObject({
        code: 'USER_NOT_FOUND',
      });

      // Katta-kichik harf va bo'shliqlar farq qilmaydi; 2FA ham so'ralsa o'chiriladi.
      const result = await users.recoverAccess(`  ${SUPER_ADMIN.email.toUpperCase()} `, {
        resetTwoFactor: true,
      });
      expect(result).toMatchObject({ email: SUPER_ADMIN.email, twoFactorReset: true });
      expect(result.temporaryPassword).toHaveLength(16);

      // Eski sessiya yopilgan, eski parol yaroqsiz.
      await admin.agent.get('/api/v1/auth/me').set(admin.auth).expect(401);
      await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: SUPER_ADMIN.email, password: NEW_PASSWORD })
        .expect(401);

      const session = await t.login(SUPER_ADMIN.email, result.temporaryPassword);
      const me = await session.agent.get('/api/v1/auth/me').set(session.auth).expect(200);
      expect(me.body.data).toMatchObject({ mustChangePassword: true, twoFactorEnabled: false });

      const [entry] = await t.prisma.auditLog.findMany({
        where: { action: 'user.reset_password' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
      expect(entry).toMatchObject({ actorId: null, after: { via: 'server-console' } });
    });

    it("o'chirilgan foydalanuvchi ro'yxatda ko'rinmaydi, emaili qayta ishlatilishi mumkin", async () => {
      const roleId = await t.roleId('ADMIN');
      const user = await t.createActiveUser(admin, {
        email: 'ketgan@gavhar.test',
        fullName: 'Ketgan Xodim',
        roleId,
      });

      await t.http().delete(`/api/v1/users/${user.id}`).set(admin.auth).expect(204);

      await user.agent.get('/api/v1/auth/me').set(user.auth).expect(401);
      await t.http().get(`/api/v1/users/${user.id}`).set(admin.auth).expect(404);
      const list = await t.http().get('/api/v1/users?search=ketgan').set(admin.auth).expect(200);
      expect(list.body.data).toHaveLength(0);
      expect(list.body.meta.total).toBe(0);

      const row = await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.deletedAt).not.toBeNull();

      await t
        .http()
        .post('/api/v1/users')
        .set(admin.auth)
        .send({
          email: 'ketgan@gavhar.test',
          fullName: 'Yangi Odam',
          roleId,
          password: TEMP_PASSWORD,
        })
        .expect(201);
    });

    it("ro'yxat: sahifalash, qidiruv va filtr", async () => {
      const roleId = await t.roleId('ADMIN');
      for (const name of ['Ali', 'Vali', 'Soli']) {
        await t
          .http()
          .post('/api/v1/users')
          .set(admin.auth)
          .send({
            email: `${name.toLowerCase()}@gavhar.test`,
            fullName: `${name} Xodim`,
            roleId,
            password: TEMP_PASSWORD,
          })
          .expect(201);
      }

      const page = await t
        .http()
        .get('/api/v1/users?limit=2&page=2&sortBy=fullName&sortOrder=asc')
        .set(admin.auth)
        .expect(200);
      expect(page.body.meta).toMatchObject({
        total: 4,
        totalPages: 2,
        hasPrev: true,
        hasNext: false,
      });
      expect(page.body.data).toHaveLength(2);

      const search = await t.http().get('/api/v1/users?search=vali').set(admin.auth).expect(200);
      expect(search.body.data.map((u: { email: string }) => u.email)).toEqual(['vali@gavhar.test']);

      const filtered = await t
        .http()
        .get(`/api/v1/users?roleId=${roleId}`)
        .set(admin.auth)
        .expect(200);
      expect(filtered.body.meta.total).toBe(3);

      await t.http().get('/api/v1/users?limit=1000').set(admin.auth).expect(400);
    });
  });

  describe('oxirgi SUPER_ADMIN himoyasi', () => {
    it("oxirgi SUPER_ADMIN o'zini pasaytira, bloklay yoki o'chira olmaydi", async () => {
      const me = await t.prisma.user.findFirstOrThrow({ where: { email: SUPER_ADMIN.email } });

      const demote = await t
        .http()
        .patch(`/api/v1/users/${me.id}`)
        .set(admin.auth)
        .send({ roleId: await t.roleId('ADMIN') })
        .expect(409);
      expect(demote.body.error.code).toBe('LAST_SUPER_ADMIN');

      await t.http().post(`/api/v1/users/${me.id}/block`).set(admin.auth).expect(400);
      await t.http().delete(`/api/v1/users/${me.id}`).set(admin.auth).expect(400);
    });

    it("ikkinchi SUPER_ADMIN bo'lsa birini pasaytirish mumkin, lekin oxirgisini emas", async () => {
      const superAdminRoleId = await t.roleId('SUPER_ADMIN');
      const adminRoleId = await t.roleId('ADMIN');
      const me = await t.prisma.user.findFirstOrThrow({ where: { email: SUPER_ADMIN.email } });

      const second = await t
        .http()
        .post('/api/v1/users')
        .set(admin.auth)
        .send({
          email: 'ikkinchi@gavhar.test',
          fullName: 'Ikkinchi Admin',
          roleId: superAdminRoleId,
          password: TEMP_PASSWORD,
        })
        .expect(201);
      const secondId: string = second.body.data.id;

      // Ikkinchisi bloklangan bo'lsa, u "faol SUPER_ADMIN" hisoblanmaydi.
      await t.http().post(`/api/v1/users/${secondId}/block`).set(admin.auth).expect(200);
      await t
        .http()
        .patch(`/api/v1/users/${me.id}`)
        .set(admin.auth)
        .send({ roleId: adminRoleId })
        .expect(409);

      await t.http().post(`/api/v1/users/${secondId}/unblock`).set(admin.auth).expect(200);
      await t
        .http()
        .patch(`/api/v1/users/${secondId}`)
        .set(admin.auth)
        .send({ roleId: adminRoleId })
        .expect(200);
      await t.http().delete(`/api/v1/users/${secondId}`).set(admin.auth).expect(204);
    });
  });

  describe('audit log', () => {
    it("kim, qachon, qayerdan, nimani o'zgartirganini saqlaydi — sirlarsiz", async () => {
      const roleId = await t.roleId('ADMIN');
      const user = await t.createActiveUser(admin, {
        email: 'xodim@gavhar.test',
        fullName: 'Eski Ism',
        roleId,
      });
      await t
        .http()
        .patch(`/api/v1/users/${user.id}`)
        .set(admin.auth)
        .set('User-Agent', 'GavharTest/1.0')
        .send({ fullName: 'Yangi Ism' })
        .expect(200);

      const res = await t
        .http()
        .get(`/api/v1/audit-logs?resource=user&resourceId=${user.id}&action=user.update`)
        .set(admin.auth)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({
        action: 'user.update',
        actorEmail: SUPER_ADMIN.email,
        before: { fullName: 'Eski Ism' },
        after: { fullName: 'Yangi Ism' },
        userAgent: 'GavharTest/1.0',
        ip: expect.any(String),
        requestId: expect.any(String),
      });

      const all = await t.http().get('/api/v1/audit-logs?limit=100').set(admin.auth).expect(200);
      const actions = all.body.data.map((log: { action: string }) => log.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'auth.login',
          'auth.password_changed',
          'auth.2fa_enabled',
          'user.create',
        ]),
      );
      const dump = JSON.stringify(all.body.data);
      expect(dump).not.toContain(NEW_PASSWORD);
      expect(dump).not.toContain(TEMP_PASSWORD);
      expect(dump).not.toContain('$argon2id$');
    });

    it('muvaffaqiyatsiz kirish urinishlari ham yoziladi', async () => {
      await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: SUPER_ADMIN.email, password: 'Notogri!Parol123' })
        .expect(401);

      const res = await t
        .http()
        .get('/api/v1/audit-logs?action=auth.login_failed')
        .set(admin.auth)
        .expect(200);

      expect(res.body.data[0]).toMatchObject({
        actorEmail: SUPER_ADMIN.email,
        after: { reason: 'invalid_credentials' },
      });
    });
  });

  it("SUPER_ADMIN boshqa foydalanuvchining sessiyalarini ko'radi va yopadi", async () => {
    const user = await t.createActiveUser(admin, {
      email: 'xodim@gavhar.test',
      fullName: 'Xodim Bir',
      roleId: await t.roleId('ADMIN'),
    });

    const sessions = await t
      .http()
      .get(`/api/v1/users/${user.id}/sessions`)
      .set(admin.auth)
      .expect(200);
    expect(sessions.body.data).toHaveLength(1);

    const revoked = await t
      .http()
      .delete(`/api/v1/users/${user.id}/sessions`)
      .set(admin.auth)
      .expect(200);
    expect(revoked.body.data).toEqual({ revoked: 1 });
    await user.agent.get('/api/v1/auth/me').set(user.auth).expect(401);
  });
});
