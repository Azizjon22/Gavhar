import { DEV_LOGIN_EMAIL_DOMAIN } from '@/modules/auth/auth.constants';
import type * as TestAppModule from './utils/test-app';
import { SUPER_ADMIN, type TestApp } from './utils/test-app';

const MISSING_ROLE = '00000000-0000-4000-8000-000000000000';

describe('Tezkor kirish — DEV_LOGIN_ENABLED (e2e)', () => {
  let t: TestApp;

  /**
   * Sozlama server ishga tushganda bir marta o'qiladi, shuning uchun har safar
   * ilova modullari qaytadan yuklanadi — xuddi serverni o'chirib-yoqqandek.
   */
  const start = async (enabled: boolean) => {
    process.env.DEV_LOGIN_ENABLED = String(enabled);
    jest.resetModules();
    const fresh = jest.requireActual<typeof TestAppModule>('./utils/test-app');
    t = await fresh.TestApp.create();
  };
  const devAccounts = () =>
    t.prisma.user.findMany({
      where: { email: { endsWith: `@${DEV_LOGIN_EMAIL_DOMAIN}` } },
      include: { role: true, sessions: true },
      orderBy: { createdAt: 'asc' },
    });

  afterEach(async () => {
    await t.close();
  });
  afterAll(() => {
    delete process.env.DEV_LOGIN_ENABLED;
  });

  it('o‘chirilgan (standart) holatda rollar berilmaydi va kirib bo‘lmaydi', async () => {
    await start(false);
    await t.reset();

    const options = await t.http().get('/api/v1/auth/dev-login').expect(200);
    expect(options.body.data).toEqual({ enabled: false, roles: [] });

    const denied = await t
      .http()
      .post('/api/v1/auth/dev-login')
      .send({ roleId: await t.roleId('SUPER_ADMIN') })
      .expect(404);
    expect(denied.body.error.code).toBe('DEV_LOGIN_DISABLED');
    expect(await devAccounts()).toEqual([]);
  });

  it('yoqilganda rol tanlab parolsiz kiriladi; rol almashtirilganda oldingi sessiya yopiladi', async () => {
    await start(true);
    await t.reset();
    await t.clearRateLimits();

    const options = (await t.http().get('/api/v1/auth/dev-login').expect(200)).body.data;
    expect(options.enabled).toBe(true);
    expect(options.roles.map((role: { key: string }) => role.key)).toEqual([
      'SUPER_ADMIN',
      'ADMIN',
      'ZAVZAL',
      'COOK',
    ]);
    const roleId = (key: string) =>
      options.roles.find((role: { key: string }) => role.key === key).id as string;

    const agent = t.agent();
    const enter = (key: string) =>
      agent
        .post('/api/v1/auth/dev-login')
        .send({ roleId: roleId(key) })
        .expect(200);

    // Super admin: majburiy 2FA (testda yoqilgan) va parol almashtirish talab qilinmaydi.
    const asSuper = (await enter('SUPER_ADMIN')).body.data;
    expect(asSuper).toMatchObject({
      requiresTwoFactor: false,
      user: {
        role: { key: 'SUPER_ADMIN' },
        mustChangePassword: false,
        mustSetupTwoFactor: false,
        twoFactorRequired: false,
      },
    });
    expect(asSuper.user.email).toMatch(new RegExp(`@${DEV_LOGIN_EMAIL_DOMAIN}$`));
    const superAuth = { Authorization: `Bearer ${asSuper.accessToken}` };
    await t.http().get('/api/v1/users').set(superAuth).expect(200);

    // Sinov hisobi haqiqiy super admin o'rnini bosmaydi: oxirgi haqiqiysini bloklab bo'lmaydi.
    const real = await t.prisma.user.findUniqueOrThrow({ where: { email: SUPER_ADMIN.email } });
    const blocked = await t
      .http()
      .post(`/api/v1/users/${real.id}/block`)
      .set(superAuth)
      .expect(409);
    expect(blocked.body.error.code).toBe('LAST_SUPER_ADMIN');

    // Rolni almashtirish: oshpaz faqat o'z bo'limini ko'radi, eski sessiya bekor bo'ladi.
    const asCook = (await enter('COOK')).body.data;
    expect(asCook.user.role.key).toBe('COOK');
    const cookAuth = { Authorization: `Bearer ${asCook.accessToken}` };
    await t.http().get('/api/v1/users').set(cookAuth).expect(403);
    await t.http().get('/api/v1/shopping/lists/general').set(cookAuth).expect(200);
    await t.http().get('/api/v1/users').set(superAuth).expect(401);

    // Qayta kirganda yangi hisob ochilmaydi — o'sha sinov hisobi ishlatiladi.
    await enter('SUPER_ADMIN');
    const accounts = await devAccounts();
    expect(accounts.map((user) => user.role.key)).toEqual(['SUPER_ADMIN', 'COOK']);
    expect(accounts.every((user) => user.status === 'ACTIVE' && !user.mustChangePassword)).toBe(
      true,
    );

    await agent.post('/api/v1/auth/dev-login').send({ roleId: MISSING_ROLE }).expect(404);
    await agent.post('/api/v1/auth/dev-login').send({ roleId: 'admin' }).expect(400);
    // Oddiy kirish avvalgidek ishlaydi.
    await t.login(SUPER_ADMIN.email, SUPER_ADMIN.password);
  });

  it('rejim o‘chirilib server qayta ishga tushganda sinov hisoblari yopiladi', async () => {
    await start(true);
    await t.reset();
    await t.clearRateLimits();
    const entered = await t
      .http()
      .post('/api/v1/auth/dev-login')
      .send({ roleId: await t.roleId('SUPER_ADMIN') })
      .expect(200);
    const auth = { Authorization: `Bearer ${entered.body.data.accessToken}` };
    await t.http().get('/api/v1/auth/me').set(auth).expect(200);
    await t.close();

    await start(false);
    const [account] = await devAccounts();
    expect(account).toMatchObject({ status: 'BLOCKED' });
    expect(account?.deletedAt).not.toBeNull();
    expect(account?.sessions.every((session) => session.revokedAt !== null)).toBe(true);
    await t.http().get('/api/v1/auth/me').set(auth).expect(401);
    // Haqiqiy hisoblar joyida.
    await t.login(SUPER_ADMIN.email, SUPER_ADMIN.password);
  });
});
