import { Response } from 'supertest';
import { localDate } from '../src/common/utils/app-date.util';
import { ActiveSuperAdmin, Authenticated, TestApp } from './utils/test-app';

const DAY = 86_400_000;
const TZ = 'Asia/Tashkent';
const day = (days = 0): string => localDate(new Date(Date.now() + days * DAY), TZ);
const slot = (days: number, hour = 20) => {
  const start = new Date(`${day(days)}T${String(hour).padStart(2, '0')}:00:00+05:00`);
  return {
    startAt: start.toISOString(),
    endAt: new Date(start.getTime() + 3_600_000).toISOString(),
  };
};

describe('Ombor partiyalari va to‘y uchun olish (e2e)', () => {
  let t: TestApp;
  let admin: ActiveSuperAdmin;
  let cook: Authenticated & { id: string };
  let manager: Authenticated & { id: string };
  let clientId: string;
  let hallId: string;
  let packageId: string;

  beforeAll(async () => {
    t = await TestApp.create();
  });

  beforeEach(async () => {
    await t.reset();
    admin = await t.activateSuperAdmin();
    await t.clearRateLimits();
    cook = await t.createActiveUser(admin, {
      email: 'oshpaz@gavhar.test',
      fullName: 'Oshpaz Ali',
      roleId: await t.roleId('COOK'),
    });
    manager = await t.createActiveUser(admin, {
      email: 'admin@gavhar.test',
      fullName: 'Admin Vali',
      roleId: await t.roleId('ADMIN'),
    });
    await t.clearRateLimits();
    clientId = (
      await data(as(admin).post('/clients', { fullName: 'Karimov Anvar', phone: '+998901234567' }))
    ).id;
    hallId = (await data(as(admin).post('/halls', { name: 'Oltin zal', capacity: 400 }))).id;
    packageId = (
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
  });

  afterAll(async () => {
    await t.close();
  });

  const data = async (req: PromiseLike<Response>) => (await req).body.data;
  const as = (user: Authenticated) => ({
    get: (path: string) => user.agent.get(`/api/v1${path}`).set(user.auth),
    post: (path: string, body: object = {}) =>
      user.agent.post(`/api/v1${path}`).set(user.auth).send(body),
    patch: (path: string, body: object = {}) =>
      user.agent.patch(`/api/v1${path}`).set(user.auth).send(body),
    del: (path: string) => user.agent.delete(`/api/v1${path}`).set(user.auth),
  });
  const book = async (days: number, hour = 20) =>
    data(
      as(admin)
        .post('/events', {
          clientId,
          hallId,
          menuPackageId: packageId,
          type: 'WEDDING',
          guestCount: 200,
          ...slot(days, hour),
        })
        .expect(201),
    );
  const item = async (id: string, by: Authenticated = admin) =>
    (await data(as(by).get('/warehouse/items'))).find((row: { id: string }) => row.id === id);

  it('partiyalar: narxni faqat super admin kiritadi va ko‘radi; chiqim eng eski partiyadan', async () => {
    const rice = await data(
      as(admin)
        .post('/warehouse/items', {
          section: 'FOOD',
          name: 'Guruch',
          unit: 'KG',
          initialQuantity: '10',
          initialCost: '120000',
        })
        .expect(201),
    );
    expect(rice).toMatchObject({
      quantity: '10',
      stockValue: '120000.00',
      unpricedQuantity: '0',
      lots: [{ quantity: '10', unitPrice: '12000.00' }],
    });
    // Narxsiz kirim oxirgi narxni oladi; boshqa narxdagi kirim — yangi partiya.
    await as(admin)
      .post(`/warehouse/items/${rice.id}/movements`, { type: 'IN', quantity: '5' })
      .expect(201);
    await as(admin)
      .post(`/warehouse/items/${rice.id}/movements`, {
        type: 'IN',
        quantity: '10',
        totalCost: '150000',
      })
      .expect(201);
    expect((await item(rice.id)).lots).toMatchObject([
      { quantity: '15', unitPrice: '12000.00' },
      { quantity: '10', unitPrice: '15000.00' },
    ]);

    // Admin narxni ko'rmaydi va kirita olmaydi.
    const seen = await item(rice.id, manager);
    expect(seen).toMatchObject({ quantity: '25' });
    expect(seen).not.toHaveProperty('lots');
    expect(seen).not.toHaveProperty('stockValue');
    await as(manager)
      .post(`/warehouse/items/${rice.id}/movements`, { type: 'IN', quantity: '1', totalCost: '1' })
      .expect(403);
    const history = await data(as(manager).get(`/warehouse/items/${rice.id}/movements`));
    expect(JSON.stringify(history)).not.toContain('150000');

    // Chiqim avval eski partiyadan: 18 kg = 15 × 12 000 + 3 × 15 000.
    await as(admin)
      .post(`/warehouse/items/${rice.id}/movements`, { type: 'OUT', quantity: '18' })
      .expect(201);
    expect((await item(rice.id)).lots).toMatchObject([{ quantity: '7', unitPrice: '15000.00' }]);

    // Narxsiz mahsulot partiyasiga narx qo'yiladi (faqat super admin).
    const salt = await data(
      as(admin)
        .post('/warehouse/items', {
          section: 'FOOD',
          name: 'Tuz',
          unit: 'KG',
          initialQuantity: '4',
        })
        .expect(201),
    );
    expect(salt).toMatchObject({ stockValue: '0.00', unpricedQuantity: '4' });
    await as(manager)
      .patch(`/warehouse/lots/${salt.lots[0].id}`, { unitPrice: '3000' })
      .expect(403);
    await as(admin).patch(`/warehouse/lots/${salt.lots[0].id}`, { unitPrice: '3000' }).expect(200);
    expect(await item(salt.id)).toMatchObject({ stockValue: '12000.00', unpricedQuantity: '0' });
  });

  it('oshpaz bugungi/ertangi to‘y uchun oladi, bugun qaytaradi; qiymat to‘y xarajatiga yoziladi', async () => {
    const rice = await data(
      as(admin)
        .post('/warehouse/items', {
          section: 'FOOD',
          name: 'Guruch',
          unit: 'KG',
          initialQuantity: '20',
          initialCost: '200000',
        })
        .expect(201),
    );
    const oil = await data(
      as(admin)
        .post('/warehouse/items', {
          section: 'FOOD',
          name: 'Yog‘',
          unit: 'LITER',
          initialQuantity: '10',
        })
        .expect(201),
    );
    const plates = await data(
      as(admin)
        .post('/warehouse/items', {
          section: 'TABLEWARE',
          name: 'Likopcha',
          unit: 'PIECE',
          initialQuantity: '100',
        })
        .expect(201),
    );
    const today = await book(0, 22);
    const later = await book(3);

    // Oshpaz faqat oziq-ovqatni ko'radi, narxsiz.
    const stock = await data(as(cook).get('/warehouse/stock').expect(200));
    expect(stock.map((row: { name: string }) => row.name)).toEqual(['Guruch', 'Yog‘']);
    expect(JSON.stringify(stock)).not.toMatch(/price|cost|lots/i);
    await as(cook).get('/warehouse/items').expect(403);

    const tooEarly = await as(cook)
      .post('/warehouse/usages', { eventId: later.id, items: [{ itemId: rice.id, quantity: '1' }] })
      .expect(409);
    expect(tooEarly.body.error.code).toBe('STOCK_TAKE_DAY');
    const tableware = await as(cook)
      .post('/warehouse/usages', {
        eventId: today.id,
        items: [{ itemId: plates.id, quantity: '1' }],
      })
      .expect(400);
    expect(tableware.body.error.code).toBe('STOCK_TAKE_FOOD_ONLY');
    const tooMuch = await as(cook)
      .post('/warehouse/usages', {
        eventId: today.id,
        items: [{ itemId: rice.id, quantity: '21' }],
      })
      .expect(409);
    expect(tooMuch.body.error.code).toBe('INSUFFICIENT_STOCK');

    const usage = await data(
      as(cook)
        .post('/warehouse/usages', {
          eventId: today.id,
          items: [
            { itemId: rice.id, quantity: '5' },
            { itemId: oil.id, quantity: '2' },
            { itemId: rice.id, quantity: '1.5' },
          ],
        })
        .expect(201),
    );
    expect(usage).toMatchObject({
      takenByName: 'Oshpaz Ali',
      event: { id: today.id },
      items: [
        { name: 'Guruch', quantity: '6.5' },
        { name: 'Yog‘', quantity: '2' },
      ],
    });
    expect(JSON.stringify(usage)).not.toMatch(/totalCost/);
    expect((await item(rice.id)).quantity).toBe('13.5');

    // Super admin qiymatni ko'radi: guruch 6.5 × 10 000; yog' narxsiz.
    const [forEvent] = await data(as(admin).get(`/warehouse/usages/event/${today.id}`));
    expect(forEvent).toMatchObject({ totalCost: '65000.00', unpriced: true });
    expect(forEvent.items[0]).toMatchObject({ name: 'Guruch', totalCost: '65000.00' });
    expect(forEvent.items[1]).toMatchObject({ name: 'Yog‘', totalCost: null });

    // To'yni o'chirib bo'lmaydi — ombordan mahsulot olingan.
    const blocked = await as(admin).del(`/events/${today.id}`).expect(409);
    expect(blocked.body.error.code).toBe('EVENT_HAS_STOCK');

    // Qiymat to'y xarajatiga yoziladi; takroran bosilsa — xato.
    const finance = await data(as(admin).get(`/finance/events/${today.id}`));
    expect(finance.stock).toEqual({
      usages: 1,
      cost: '65000.00',
      unpriced: true,
      recordedAmount: null,
    });
    await as(manager).post(`/finance/events/${today.id}/stock-expense`).expect(403);
    const expense = await data(
      as(admin).post(`/finance/events/${today.id}/stock-expense`).expect(200),
    );
    expect(expense).toMatchObject({
      amount: '65000.00',
      date: day(0),
      category: { name: 'Ombor mahsulotlari' },
      event: { id: today.id },
    });
    const again = await as(admin).post(`/finance/events/${today.id}/stock-expense`).expect(409);
    expect(again.body.error.code).toBe('STOCK_EXPENSE_EXISTS');

    // Boshqa oshpaz qaytara olmaydi; o'zi bugun qaytaradi — partiya narxi bilan joyiga.
    const other = await t.createActiveUser(admin, {
      email: 'oshpaz2@gavhar.test',
      fullName: 'Oshpaz Bobur',
      roleId: await t.roleId('COOK'),
    });
    const foreign = await as(other).del(`/warehouse/usages/${usage.id}`).expect(409);
    expect(foreign.body.error.code).toBe('STOCK_RETURN_FORBIDDEN');
    expect(await data(as(cook).get('/warehouse/usages/mine'))).toHaveLength(1);
    await as(cook).del(`/warehouse/usages/${usage.id}`).expect(204);
    expect(await item(rice.id)).toMatchObject({
      quantity: '20',
      stockValue: '200000.00',
      lots: [{ quantity: '20', unitPrice: '10000.00' }],
    });
    expect(await data(as(cook).get('/warehouse/usages/mine'))).toEqual([]);

    // Qaytarilgandan keyin xarajat yangi qiymatga tenglashtiriladi (bu yerda — 0).
    const empty = await as(admin).post(`/finance/events/${today.id}/stock-expense`).expect(400);
    expect(empty.body.error.code).toBe('STOCK_COST_EMPTY');

    const history = await data(as(admin).get(`/warehouse/items/${rice.id}/movements`));
    expect(history.map((row: { type: string; note: string }) => [row.type, row.note])).toEqual([
      ['IN', expect.stringContaining('To‘ydan qaytarildi: № 1')],
      ['OUT', expect.stringContaining('To‘yga olindi: № 1')],
      ['IN', 'Boshlang‘ich qoldiq'],
    ]);
  });
});
