import { NEW_PASSWORD, SUPER_ADMIN, TestApp, totpCode } from './utils/test-app';

describe('Auth (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await TestApp.create();
  });

  beforeEach(async () => {
    await t.reset();
  });

  afterAll(async () => {
    await t.close();
  });

  const login = (email: string, password: string) =>
    t.http().post('/api/v1/auth/login').send({ email, password });

  describe('kirish va brute-force himoyasi', () => {
    it("noto'g'ri parol va mavjud bo'lmagan email bir xil javob oladi", async () => {
      const wrongPassword = await login(SUPER_ADMIN.email, 'Notogri!Parol123').expect(401);
      const unknownEmail = await login('yoq@gavhar.test', 'Notogri!Parol123').expect(401);

      expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(unknownEmail.body.error).toEqual(wrongPassword.body.error);
    });

    it("5 ta xato urinishdan keyin hisob bloklanadi — to'g'ri parol ham o'tmaydi", async () => {
      for (let i = 0; i < 4; i++) {
        await login(SUPER_ADMIN.email, 'Notogri!Parol123').expect(401);
      }

      const fifth = await login(SUPER_ADMIN.email, 'Notogri!Parol123').expect(429);
      expect(fifth.body.error.code).toBe('ACCOUNT_LOCKED');
      expect(fifth.body.error.details.retryAfterSeconds).toBe(60);

      const correct = await login(SUPER_ADMIN.email, SUPER_ADMIN.password).expect(429);
      expect(correct.body.error.code).toBe('ACCOUNT_LOCKED');
    });

    it('har navbatdagi bloklash uzoqroq davom etadi (progressiv kutish)', async () => {
      const lockOut = async () => {
        let last = await login(SUPER_ADMIN.email, 'Notogri!Parol123');
        for (let i = 0; i < 4; i++) last = await login(SUPER_ADMIN.email, 'Notogri!Parol123');
        return last;
      };

      expect((await lockOut()).body.error.details.retryAfterSeconds).toBe(60);

      // Birinchi blok muddati tugadi deb hisoblaymiz.
      const lockKeys = await t.redis.keys('auth:login:lock:*');
      await t.redis.del(...lockKeys);
      await t.clearRateLimits();

      expect((await lockOut()).body.error.details.retryAfterSeconds).toBe(300);
    });

    it("bir IP'dan juda ko'p urinish rate-limit bilan to'xtatiladi", async () => {
      for (let i = 0; i < 10; i++) {
        await login(`user${i}@gavhar.test`, 'Notogri!Parol123').expect(401);
      }

      const res = await login('user11@gavhar.test', 'Notogri!Parol123').expect(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
      expect(res.headers['retry-after']).toBeDefined();
    });

    it("javobda va cookie'da sirlar to'g'ri joylashadi", async () => {
      const res = await login(SUPER_ADMIN.email, SUPER_ADMIN.password).expect(200);
      const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
      const refreshCookie = cookies.find((c) => c.startsWith('gavhar_rt='));

      expect(refreshCookie).toMatch(/HttpOnly/i);
      expect(refreshCookie).toMatch(/SameSite=Strict/i);
      expect(refreshCookie).toMatch(/Path=\/api\/v1\/auth/);
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|refreshToken|totpSecret/);
      expect(res.body.data.expiresIn).toBe(900);
    });

    it("ortiqcha maydonli so'rov rad etiladi", async () => {
      const res = await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: SUPER_ADMIN.email, password: SUPER_ADMIN.password, role: 'SUPER_ADMIN' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('birinchi kirish', () => {
    it('SUPER_ADMIN parolni almashtirmaguncha va 2FA ulamaguncha tizimdan foydalana olmaydi', async () => {
      const { agent, auth } = await t.login(SUPER_ADMIN.email, SUPER_ADMIN.password);

      const me = await agent.get('/api/v1/auth/me').set(auth).expect(200);
      expect(me.body.data).toMatchObject({
        mustChangePassword: true,
        mustSetupTwoFactor: true,
        role: { key: 'SUPER_ADMIN' },
      });

      const blocked = await agent.get('/api/v1/users').set(auth).expect(403);
      expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');

      const weak = await agent
        .post('/api/v1/auth/change-password')
        .set(auth)
        .send({ currentPassword: SUPER_ADMIN.password, newPassword: 'qisqa' })
        .expect(400);
      expect(weak.body.error.code).toBe('VALIDATION_ERROR');

      await agent
        .post('/api/v1/auth/change-password')
        .set(auth)
        .send({ currentPassword: SUPER_ADMIN.password, newPassword: NEW_PASSWORD })
        .expect(204);

      const needs2fa = await agent.get('/api/v1/users').set(auth).expect(403);
      expect(needs2fa.body.error.code).toBe('TWO_FACTOR_SETUP_REQUIRED');

      const setup = await agent.post('/api/v1/auth/2fa/setup').set(auth).expect(200);
      expect(setup.body.data.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(setup.body.data.otpauthUrl).toContain('otpauth://totp/Gavhar');

      await agent.post('/api/v1/auth/2fa/enable').set(auth).send({ code: '000000' }).expect(400);

      const enabled = await agent
        .post('/api/v1/auth/2fa/enable')
        .set(auth)
        .send({ code: totpCode(setup.body.data.secret) })
        .expect(200);
      expect(enabled.body.data.backupCodes).toHaveLength(10);

      await agent.get('/api/v1/users').set(auth).expect(200);
    });

    it('TOTP siri bazada shifrlangan, zaxira kodlar hash holida saqlanadi', async () => {
      const admin = await t.activateSuperAdmin();
      const user = await t.prisma.user.findFirstOrThrow({ where: { email: SUPER_ADMIN.email } });
      const codes = await t.prisma.backupCode.findMany({ where: { userId: user.id } });

      expect(user.totpSecretEnc).toMatch(/^v1\./);
      expect(user.totpSecretEnc).not.toContain(admin.totpSecret);
      expect(user.passwordHash).toMatch(/^\$argon2id\$v=19\$/);
      expect(user.passwordHash).toMatch(/m=65536/);
      expect(user.passwordHash).toMatch(/t=3/);
      expect(codes).toHaveLength(10);
      for (const code of codes) {
        expect(admin.backupCodes).not.toContain(code.codeHash);
      }
    });
  });

  describe('2FA bilan kirish', () => {
    it("parol to'g'ri bo'lsa ham kod talab qilinadi; kod bir marta ishlaydi", async () => {
      const admin = await t.activateSuperAdmin();

      const step1 = await login(SUPER_ADMIN.email, NEW_PASSWORD).expect(200);
      expect(step1.body.data).toEqual({
        requiresTwoFactor: true,
        challengeToken: expect.any(String),
      });
      expect(step1.headers['set-cookie']).toBeUndefined();

      const { challengeToken } = step1.body.data;
      const wrong = await t
        .http()
        .post('/api/v1/auth/2fa/verify')
        .send({ challengeToken, code: '000000' })
        .expect(401);
      expect(wrong.body.error.code).toBe('INVALID_2FA_CODE');

      // 2FA ni yoqishda ishlatilgan kod qayta ishlamaydi (replay himoyasi).
      await t
        .http()
        .post('/api/v1/auth/2fa/verify')
        .send({ challengeToken, code: totpCode(admin.totpSecret) })
        .expect(401);

      const ok = await t
        .http()
        .post('/api/v1/auth/2fa/verify')
        .send({ challengeToken, code: totpCode(admin.totpSecret, 1) })
        .expect(200);
      expect(ok.body.data.accessToken).toEqual(expect.any(String));
      expect(ok.body.data.user.mustSetupTwoFactor).toBe(false);

      // Challenge bir martalik.
      await t
        .http()
        .post('/api/v1/auth/2fa/verify')
        .send({ challengeToken, code: admin.backupCodes[0] })
        .expect(401);
    });

    it('zaxira kod bilan kirish mumkin, lekin har bir kod faqat bir marta', async () => {
      const admin = await t.activateSuperAdmin();
      const backupCode = admin.backupCodes[0] as string;

      const first = await login(SUPER_ADMIN.email, NEW_PASSWORD).expect(200);
      await t
        .http()
        .post('/api/v1/auth/2fa/verify')
        .send({ challengeToken: first.body.data.challengeToken, code: backupCode.toLowerCase() })
        .expect(200);

      const second = await login(SUPER_ADMIN.email, NEW_PASSWORD).expect(200);
      await t
        .http()
        .post('/api/v1/auth/2fa/verify')
        .send({ challengeToken: second.body.data.challengeToken, code: backupCode })
        .expect(401);

      const status = await admin.agent.get('/api/v1/auth/2fa/status').set(admin.auth).expect(200);
      expect(status.body.data).toEqual({ enabled: true, backupCodesRemaining: 9 });
    });

    it("SUPER_ADMIN 2FA ni o'chira olmaydi", async () => {
      const admin = await t.activateSuperAdmin();

      const res = await admin.agent
        .post('/api/v1/auth/2fa/disable')
        .set(admin.auth)
        .send({ password: NEW_PASSWORD, code: totpCode(admin.totpSecret, 1) })
        .expect(403);

      expect(res.body.error.code).toBe('TWO_FACTOR_REQUIRED_FOR_ROLE');
    });
  });

  describe('refresh token', () => {
    const refreshCookieOf = (res: { headers: Record<string, unknown> }): string => {
      const cookies = ([] as string[]).concat((res.headers['set-cookie'] as string[]) ?? []);
      const cookie = cookies.find((c) => c.startsWith('gavhar_rt='));
      return (cookie as string).split(';')[0] as string;
    };

    it('CSRF tokeni barqaror: bir nechta tab bir-birining tokenini eskirtirmaydi', async () => {
      const agent = t.agent();
      const first = await agent.get('/api/v1/auth/csrf').expect(200);
      const second = await agent.get('/api/v1/auth/csrf').expect(200);
      expect(second.body.data.csrfToken).toBe(first.body.data.csrfToken);

      const loggedIn = await agent
        .post('/api/v1/auth/login')
        .send({ email: SUPER_ADMIN.email, password: SUPER_ADMIN.password })
        .expect(200);
      expect(loggedIn.body.data.csrfToken).toBe(first.body.data.csrfToken);

      // Buzilgan cookie qayta ishlatilmaydi — o'rniga yangi token beriladi.
      const replaced = await t
        .http()
        .get('/api/v1/auth/csrf')
        .set('Cookie', 'gavhar_csrf=<script>')
        .expect(200);
      expect(replaced.body.data.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('CSRF tokenisiz refresh rad etiladi', async () => {
      const { agent } = await t.login(SUPER_ADMIN.email, SUPER_ADMIN.password);

      const res = await agent.post('/api/v1/auth/refresh').expect(403);
      expect(res.body.error.code).toBe('CSRF_TOKEN_INVALID');

      await agent.post('/api/v1/auth/refresh').set('X-CSRF-Token', 'soxta').expect(403);
    });

    it('har refreshda yangi token beriladi (rotation)', async () => {
      const { agent, csrfToken, accessToken } = await t.login(
        SUPER_ADMIN.email,
        SUPER_ADMIN.password,
      );

      const first = await agent
        .post('/api/v1/auth/refresh')
        .set('X-CSRF-Token', csrfToken)
        .expect(200);
      const second = await agent
        .post('/api/v1/auth/refresh')
        .set('X-CSRF-Token', first.body.data.csrfToken)
        .expect(200);

      expect(first.body.data.accessToken).toEqual(expect.any(String));
      expect(refreshCookieOf(second)).not.toBe(refreshCookieOf(first));
      expect(accessToken).toEqual(expect.any(String));

      const tokens = await t.prisma.refreshToken.findMany();
      expect(tokens).toHaveLength(3);
      expect(tokens.filter((token) => token.usedAt === null)).toHaveLength(1);
      // Bazada ochiq token emas, faqat SHA-256 hash.
      expect(tokens.map((token) => token.tokenHash)).not.toContain(
        refreshCookieOf(second).replace('gavhar_rt=', ''),
      );
    });

    it('ishlatilgan token qayta kelsa — barcha sessiyalar bekor qilinadi (reuse detection)', async () => {
      const victim = await t.login(SUPER_ADMIN.email, SUPER_ADMIN.password);
      const otherDevice = await t.login(SUPER_ADMIN.email, SUPER_ADMIN.password);

      const loginRes = await login(SUPER_ADMIN.email, SUPER_ADMIN.password).expect(200);
      const stolenCookie = refreshCookieOf(loginRes);
      const csrf: string = loginRes.body.data.csrfToken;
      const refresh = () =>
        t
          .http()
          .post('/api/v1/auth/refresh')
          .set('Cookie', [stolenCookie, `gavhar_csrf=${csrf}`])
          .set('X-CSRF-Token', csrf);

      const legit = await refresh().expect(200);
      const reuse = await refresh().expect(401);
      expect(reuse.body.error.code).toBe('TOKEN_REUSE_DETECTED');

      // Yangi berilgan token ham, boshqa qurilmalar ham endi ishlamaydi.
      await t
        .http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', [refreshCookieOf(legit), `gavhar_csrf=${csrf}`])
        .set('X-CSRF-Token', csrf)
        .expect(401);
      await victim.agent.get('/api/v1/auth/me').set(victim.auth).expect(401);
      await otherDevice.agent.get('/api/v1/auth/me').set(otherDevice.auth).expect(401);

      const audit = await t.prisma.auditLog.findFirst({ where: { action: 'auth.token_reuse' } });
      expect(audit).not.toBeNull();
    });

    it('logout sessiyani darhol bekor qiladi', async () => {
      const { agent, auth, csrfToken } = await t.login(SUPER_ADMIN.email, SUPER_ADMIN.password);

      await agent.get('/api/v1/auth/me').set(auth).expect(200);
      await agent.post('/api/v1/auth/logout').set('X-CSRF-Token', csrfToken).expect(204);

      const after = await agent.get('/api/v1/auth/me').set(auth).expect(401);
      expect(after.body.error.code).toBe('SESSION_REVOKED');
      await agent.post('/api/v1/auth/refresh').set('X-CSRF-Token', csrfToken).expect(403);
    });
  });

  describe('sessiyalar', () => {
    it("foydalanuvchi o'z sessiyalarini ko'radi va boshqa qurilmani uzadi", async () => {
      const laptop = await t.login(SUPER_ADMIN.email, SUPER_ADMIN.password);
      const phone = await t.login(SUPER_ADMIN.email, SUPER_ADMIN.password);

      const list = await laptop.agent
        .get('/api/v1/auth/sessions')
        .set(laptop.auth)
        .set('User-Agent', 'Laptop')
        .expect(200);
      expect(list.body.data).toHaveLength(2);
      expect(list.body.data.filter((s: { isCurrent: boolean }) => s.isCurrent)).toHaveLength(1);

      const other = list.body.data.find((s: { isCurrent: boolean }) => !s.isCurrent);
      await laptop.agent.delete(`/api/v1/auth/sessions/${other.id}`).set(laptop.auth).expect(204);

      await phone.agent.get('/api/v1/auth/me').set(phone.auth).expect(401);
      await laptop.agent.get('/api/v1/auth/me').set(laptop.auth).expect(200);
    });

    it("parol o'zgarganda boshqa qurilmalardagi sessiyalar yopiladi", async () => {
      const laptop = await t.login(SUPER_ADMIN.email, SUPER_ADMIN.password);
      const phone = await t.login(SUPER_ADMIN.email, SUPER_ADMIN.password);

      await laptop.agent
        .post('/api/v1/auth/change-password')
        .set(laptop.auth)
        .send({ currentPassword: SUPER_ADMIN.password, newPassword: NEW_PASSWORD })
        .expect(204);

      await phone.agent.get('/api/v1/auth/me').set(phone.auth).expect(401);
      await laptop.agent.get('/api/v1/auth/me').set(laptop.auth).expect(200);
      await login(SUPER_ADMIN.email, SUPER_ADMIN.password).expect(401);
    });
  });

  it('tokensiz va soxta token bilan himoyalangan endpoint yopiq', async () => {
    const none = await t.http().get('/api/v1/auth/me').expect(401);
    expect(none.body.error.code).toBe('UNAUTHENTICATED');

    const forged = await t
      .http()
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4Iiwic2lkIjoieSJ9.')
      .expect(401);
    expect(forged.body.error.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('health va readiness ochiq', async () => {
    await t.http().get('/api/v1/health').expect(200);
    const ready = await t.http().get('/api/v1/health/ready').expect(200);

    expect(ready.body.data.services).toEqual({ database: 'up', redis: 'up', storage: 'up' });
  });
});
