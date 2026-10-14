import { createHmac } from 'node:crypto';
import { Response } from 'supertest';
import { localDate } from '../src/common/utils/app-date.util';
import type * as TelegramApiModule from '../src/modules/telegram/telegram.api';
import type * as TelegramServiceModule from '../src/modules/telegram/telegram.service';
import type * as TestAppModule from './utils/test-app';
import type { ActiveSuperAdmin, Authenticated, TestApp } from './utils/test-app';

const TOKEN = '123456:test-token';
const DAY = 86_400_000;
const day = (days = 0): string => localDate(new Date(Date.now() + days * DAY), 'Asia/Tashkent');

interface Call {
  method: string;
  body: Record<string, unknown>;
}

/** Haqiqiy Telegram o'rniga: chaqiruvlarni yozib boradi. */
class FakeTelegramApi {
  readonly calls: Call[] = [];
  private nextId = 1;
  call(method: string, body: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ method, body });
    if (method === 'getMe') return Promise.resolve({ username: 'gavhar_test_bot' });
    if (method === 'sendMessage' || method === 'editMessageText') {
      return Promise.resolve({ message_id: this.nextId++ });
    }
    return Promise.resolve(true);
  }
  sent(chatId: number | string) {
    return this.calls.filter(
      (call) => call.method === 'sendMessage' && String(call.body.chat_id) === String(chatId),
    );
  }
}

/** Telegram hujjatidagi tartibda imzolangan Mini App initData. */
const signInitData = (userId: number, token = TOKEN, authDate = Math.floor(Date.now() / 1000)) => {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: 'AAE',
    user: JSON.stringify({ id: userId, first_name: 'Test' }),
  });
  const check = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
};

describe('Telegram bot va Mini App (e2e)', () => {
  let t: TestApp;
  let fake: FakeTelegramApi;
  let bot: TelegramServiceModule.TelegramService;
  let admin: ActiveSuperAdmin;

  beforeAll(async () => {
    process.env.TELEGRAM_BOT_TOKEN = TOKEN;
    jest.resetModules();
    const { TestApp: FreshTestApp } = jest.requireActual<typeof TestAppModule>('./utils/test-app');
    const { TelegramApi } = jest.requireActual<typeof TelegramApiModule>(
      '../src/modules/telegram/telegram.api',
    );
    const { TelegramService } = jest.requireActual<typeof TelegramServiceModule>(
      '../src/modules/telegram/telegram.service',
    );
    fake = new FakeTelegramApi();
    t = await FreshTestApp.create((builder) =>
      builder.overrideProvider(TelegramApi).useValue(fake),
    );
    bot = t.app.get(TelegramService);
  });

  beforeEach(async () => {
    await t.reset();
    admin = await t.activateSuperAdmin();
    await t.clearRateLimits();
    fake.calls.length = 0;
  });

  afterAll(async () => {
    await t.close();
    process.env.TELEGRAM_BOT_TOKEN = '';
  });

  const data = async (req: PromiseLike<Response>) => (await req).body.data;
  const as = (user: Authenticated) => ({
    get: (path: string) => user.agent.get(`/api/v1${path}`).set(user.auth),
    post: (path: string, body: object = {}) =>
      user.agent.post(`/api/v1${path}`).set(user.auth).send(body),
    del: (path: string) => user.agent.delete(`/api/v1${path}`).set(user.auth),
  });
  const say = (chatId: number, text: string) =>
    bot.handleMessage({ message_id: 1, chat: { id: chatId, type: 'private' }, text });
  /** Profil sahifasidagi havola orqali ulash: havola → botga /start <token>. */
  const link = async (user: Authenticated, chatId: number) => {
    const { url } = await data(as(user).post('/telegram/link').expect(200));
    const token = new URL(url as string).searchParams.get('start') ?? '';
    await say(chatId, `/start ${token}`);
    return token;
  };
  /** Bildirishnomalar so'rovdan keyin fonda ketadi — kelguncha kutiladi. */
  const waitFor = async (check: () => boolean) => {
    for (let i = 0; i < 50 && !check(); i++) await new Promise((r) => setTimeout(r, 40));
    expect(check()).toBe(true);
  };
  const textOf = (call: Call | undefined) =>
    typeof call?.body.text === 'string' ? call.body.text : '';

  it('ulash: bir martalik havola, takror ishlamaydi; /chiqish va Profil orqali uzish', async () => {
    expect(await data(as(admin).get('/telegram/status'))).toEqual({
      enabled: true,
      botUsername: 'gavhar_test_bot',
      linked: false,
      linkedAt: null,
    });
    const { url } = await data(as(admin).post('/telegram/link').expect(200));
    expect(url).toMatch(/^https:\/\/t\.me\/gavhar_test_bot\?start=[\w-]{20,}$/);

    const token = await link(admin, 111);
    expect(textOf(fake.sent(111).at(-1))).toContain('bot hisobingizga ulandi');
    expect(fake.calls.some((call) => call.method === 'setMyCommands')).toBe(true);
    expect(await data(as(admin).get('/telegram/status'))).toMatchObject({ linked: true });

    // Havola bir martalik.
    await say(222, `/start ${token}`);
    expect(textOf(fake.sent(222).at(-1))).toContain('eskirgan');
    // Ulanmagan chat buyruq bera olmaydi.
    await say(222, '/toylar');
    expect(textOf(fake.sent(222).at(-1))).toContain('Profil');

    await say(111, '/toylar');
    expect(textOf(fake.sent(111).at(-1))).toMatch(/to'y yo'q|Yaqin to'ylar/);
    await say(111, '/hisobot');
    expect(textOf(fake.sent(111).at(-1))).toContain('Sof foyda');

    await say(111, '/chiqish');
    expect(await data(as(admin).get('/telegram/status'))).toMatchObject({ linked: false });
    await link(admin, 111);
    await as(admin).del('/telegram/link').expect(204);
    expect(await data(as(admin).get('/telegram/status'))).toMatchObject({ linked: false });

    const audit = await data(as(admin).get('/audit-logs?resource=user'));
    expect(audit.map((row: { action: string }) => row.action)).toEqual(
      expect.arrayContaining(['telegram.link', 'telegram.unlink']),
    );
  });

  it('bozorlik: yangi ro‘yxat super adminga, yuborilgani xaridchiga, xarid hisoboti — narxlar bilan', async () => {
    const cook = await t.createActiveUser(admin, {
      email: 'oshpaz@gavhar.test',
      fullName: 'Oshpaz Ali',
      roleId: await t.roleId('COOK'),
    });
    const buyer = await t.createActiveUser(admin, {
      email: 'xaridchi@gavhar.test',
      fullName: 'Admin Vali',
      roleId: await t.roleId('ADMIN'),
    });
    await t.clearRateLimits();
    await link(admin, 111);
    await link(cook, 222);
    await link(buyer, 333);
    // Oshpaz bot buyruqlarida hisobot yo'q.
    await say(222, '/hisobot');
    expect(textOf(fake.sent(222).at(-1))).toContain('faqat moliyaga');

    const list = await data(
      as(cook)
        .post('/shopping/lists', {
          items: [
            { name: 'Tuz', unit: 'PACK', quantity: '10' },
            { name: 'Salfetka', unit: 'BOX', quantity: '4' },
          ],
        })
        .expect(201),
    );
    await waitFor(() =>
      fake.sent(111).some((call) => textOf(call).includes("Yangi bozorlik ro'yxati")),
    );
    const announced = fake
      .sent(111)
      .find((call) => textOf(call).includes("Yangi bozorlik ro'yxati"));
    expect(textOf(announced)).toContain('• Tuz — 10 qadoq');
    expect(fake.sent(333)).toHaveLength(1); // faqat ulash xabari — hali yuborilmagan

    await as(admin).post(`/shopping/lists/${list.id}/approve`).expect(200);
    await waitFor(() => fake.sent(333).some((call) => textOf(call).includes('xarid qilish kerak')));
    await waitFor(() =>
      fake.calls.some(
        (call) => call.method === 'editMessageText' && textOf(call).includes('adminga yuborildi'),
      ),
    );

    for (const [index, price] of ['15000', '48000'].entries()) {
      await as(buyer)
        .post(`/shopping/lists/${list.id}/items/${list.items[index].id}/purchase`, { price })
        .expect(200);
    }
    await waitFor(() => fake.sent(111).some((call) => textOf(call).includes('xarid qilindi')));
    const report = textOf(fake.sent(111).find((call) => textOf(call).includes('xarid qilindi')));
    expect(report).toContain("Jami: 63 000 so'm");
    expect(report).toContain("(1 qadoq — 1 500 so'm)");
    // Xaridchi va oshpazga narx hisoboti bormaydi.
    expect(fake.sent(222).some((call) => textOf(call).includes('Jami'))).toBe(false);

    // Narx tuzatilsa — hisobot xabari tahrirlanadi.
    fake.calls.length = 0;
    await t
      .http()
      .patch(`/api/v1/shopping/lists/${list.id}/items/${list.items[0].id}/price`)
      .set(buyer.auth)
      .send({ price: '20000' })
      .expect(200);
    await waitFor(() =>
      fake.calls.some(
        (call) => call.method === 'editMessageText' && textOf(call).includes("Jami: 68 000 so'm"),
      ),
    );
  });

  it('ombor: oshpaz olgani super adminga qiymati bilan, qaytarilgani — javob xabari', async () => {
    const cook = await t.createActiveUser(admin, {
      email: 'oshpaz@gavhar.test',
      fullName: 'Oshpaz Ali',
      roleId: await t.roleId('COOK'),
    });
    await t.clearRateLimits();
    await link(admin, 111);
    const clientId = (
      await data(as(admin).post('/clients', { fullName: 'Karimov Anvar', phone: '+998901234567' }))
    ).id;
    const hallId = (await data(as(admin).post('/halls', { name: 'Oltin zal', capacity: 400 }))).id;
    const packageId = (
      await data(
        as(admin).post('/menu/packages', {
          name: 'Paket',
          price: '30000000',
          guestCount: 200,
          packageType: 'FULL',
          sections: [],
        }),
      )
    ).id;
    const start = new Date(`${day(1)}T18:00:00+05:00`);
    const event = await data(
      as(admin)
        .post('/events', {
          clientId,
          hallId,
          menuPackageId: packageId,
          type: 'WEDDING',
          guestCount: 200,
          startAt: start.toISOString(),
          endAt: new Date(start.getTime() + 3_600_000).toISOString(),
        })
        .expect(201),
    );
    const rice = await data(
      as(admin)
        .post('/warehouse/items', {
          section: 'FOOD',
          name: 'Guruch',
          unit: 'KG',
          initialQuantity: '50',
          initialCost: '750000',
        })
        .expect(201),
    );

    // Ertangi to'yga ro'yxat yozilmagan — oshpazga eslatma.
    await link(cook, 222);
    fake.calls.length = 0;
    await say(222, '/tekshir');
    expect(textOf(fake.sent(222).at(-1))).toContain("Ertaga to'y bor");

    const usage = await data(
      as(cook)
        .post('/warehouse/usages', {
          eventId: event.id,
          items: [{ itemId: rice.id, quantity: '10' }],
        })
        .expect(201),
    );
    await waitFor(() =>
      fake.sent(111).some((call) => textOf(call).includes("Ombordan to'yga olindi")),
    );
    const taken = textOf(
      fake.sent(111).find((call) => textOf(call).includes("Ombordan to'yga olindi")),
    );
    expect(taken).toContain('• Guruch — 10 kg');
    expect(taken).toContain("Qiymati: 150 000 so'm");

    await as(cook).del(`/warehouse/usages/${usage.id}`).expect(204);
    await waitFor(() => fake.sent(111).some((call) => textOf(call).includes('omborga qaytarildi')));
  });

  it('Mini App: imzolangan initData bilan kirish; soxta, eskirgan yoki ulanmagan rad etiladi', async () => {
    const cook = await t.createActiveUser(admin, {
      email: 'oshpaz@gavhar.test',
      fullName: 'Oshpaz Ali',
      roleId: await t.roleId('COOK'),
    });
    await t.clearRateLimits();
    await link(cook, 222);

    const ok = await t
      .http()
      .post('/api/v1/auth/telegram')
      .send({ initData: signInitData(222) })
      .expect(200);
    expect(ok.body.data).toMatchObject({ user: { email: 'oshpaz@gavhar.test' } });
    expect(ok.body.data.accessToken).toEqual(expect.any(String));
    expect(String(ok.headers['set-cookie'])).toContain('HttpOnly');

    const reject = async (initData: string, code: string) => {
      const res = await t.http().post('/api/v1/auth/telegram').send({ initData }).expect(401);
      expect(res.body.error.code).toBe(code);
    };
    await reject(signInitData(222, 'boshqa:token'), 'TELEGRAM_AUTH_INVALID');
    await reject(
      signInitData(222, TOKEN, Math.floor(Date.now() / 1000) - (2 * DAY) / 1000),
      'TELEGRAM_AUTH_INVALID',
    );
    await reject(signInitData(999), 'TELEGRAM_NOT_LINKED');
    await reject('user=%7B%22id%22%3A222%7D', 'TELEGRAM_AUTH_INVALID');
  });
});
