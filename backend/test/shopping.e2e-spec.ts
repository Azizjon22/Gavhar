import { Response } from 'supertest';
import { localDate } from '../src/common/utils/app-date.util';
import { ActiveSuperAdmin, Authenticated, TestApp } from './utils/test-app';

const DAY = 86_400_000;
const TZ = 'Asia/Tashkent';
const day = (days = 0): string => localDate(new Date(Date.now() + days * DAY), TZ);
const slot = (days: number) => {
  const start = new Date(`${day(days)}T08:00:00+05:00`);
  return {
    startAt: start.toISOString(),
    endAt: new Date(start.getTime() + 3_600_000).toISOString(),
  };
};

describe('Bozorlik (e2e)', () => {
  let t: TestApp;
  let admin: ActiveSuperAdmin;
  let cook: Authenticated & { id: string };
  let buyer: Authenticated & { id: string };
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
    buyer = await t.createActiveUser(admin, {
      email: 'xaridchi@gavhar.test',
      fullName: 'Admin Vali',
      roleId: await t.roleId('ADMIN'),
    });
    await t.clearRateLimits();

    clientId = (
      await data(as(admin).post('/clients', { fullName: 'Karimov Anvar', phone: '+998901234567' }))
    ).id;
    hallId = (await data(as(admin).post('/halls', { name: 'Oltin zal', capacity: 400 }))).id;
    const salads = await data(
      as(admin).post('/menu/categories', { nameUz: 'Salatlar', nameRu: 'Салаты' }),
    );
    packageId = (
      await data(
        as(admin).post('/menu/packages', {
          name: 'Premium',
          pricePerGuest: '200000',
          sections: [{ categoryId: salads.id, kindsCount: 4, items: ['Sezar', 'Olivye'] }],
        }),
      )
    ).id;
  });

  afterAll(async () => {
    await t.close();
  });

  const data = async (req: PromiseLike<Response>) => (await req).body.data;
  /** Shu foydalanuvchi nomidan so'rov yuboradigan qisqa yordamchi. */
  const as = (user: Authenticated) => ({
    get: (path: string) => user.agent.get(`/api/v1${path}`).set(user.auth),
    post: (path: string, body: object = {}) =>
      user.agent.post(`/api/v1${path}`).set(user.auth).send(body),
    put: (path: string, body: object = {}) =>
      user.agent.put(`/api/v1${path}`).set(user.auth).send(body),
    patch: (path: string, body: object = {}) =>
      user.agent.patch(`/api/v1${path}`).set(user.auth).send(body),
    del: (path: string) => user.agent.delete(`/api/v1${path}`).set(user.auth),
  });

  const book = async (days: number) =>
    data(
      as(admin)
        .post('/events', {
          clientId,
          hallId,
          type: 'WEDDING',
          title: 'Anvar va Nodira to‘yi',
          guestCount: 300,
          pricePerGuest: '200000',
          menuPackageId: packageId,
          tableCapacity: 10,
          firstDish: 'Osh',
          secondDish: 'Qozon kabob',
          ...slot(days),
        })
        .expect(201),
    );
  const ITEMS = [
    { name: 'Kartoshka', unit: 'KG', quantity: '40' },
    { name: 'Bodring', unit: 'KG', quantity: '10' },
    { name: 'Aysberg salat', unit: 'PIECE', quantity: '6' },
  ];
  const writeList = async (eventId: string, by: Authenticated = cook) =>
    data(as(by).post(`/shopping/events/${eventId}/lists`, { items: ITEMS }).expect(201));
  const kitchen = async (by: Authenticated = admin) =>
    data(
      as(by)
        .get(`/shopping/events?from=${day(-3)}&to=${day(10)}`)
        .expect(200),
    );
  const finance = () =>
    data(
      as(admin)
        .get(`/finance/summary?from=${day(-3)}&to=${day(3)}`)
        .expect(200),
    );
  const prices = (list: { items: { id: string; quantity: string }[] }, values: (string | null)[]) =>
    list.items.map((item, index) => ({
      id: item.id,
      quantity: item.quantity,
      ...(values[index] === null ? { skipped: true } : { price: values[index] }),
    }));

  it('tizim rollari: Oshpaz faqat bozorlikni ko‘radi va yozadi, Admin xarid qiladi', async () => {
    const roles = await data(as(admin).get('/roles').expect(200));
    const role = (key: string) =>
      roles.find((item: { key: string }) => item.key === key) as { permissions: string[] };
    expect([...role('COOK').permissions].sort()).toEqual(['shopping:create', 'shopping:read']);
    expect(role('ADMIN').permissions).toEqual(
      expect.arrayContaining(['shopping:read', 'shopping:create', 'shopping:purchase']),
    );
  });

  it('to‘liq oqim: oshpaz → super admin → admin → super admin tasdig‘i → xarajat', async () => {
    const event = await book(0);
    const list = await writeList(event.id);
    expect(list).toMatchObject({ status: 'SUBMITTED', createdByName: 'Oshpaz Ali', total: '0.00' });

    // Oshpaz to'yni menyusi bilan ko'radi, lekin pul va telefon ko'rinmaydi.
    const [seen] = await kitchen(cook);
    expect(seen).toMatchObject({
      number: 1,
      day: day(0),
      guestCount: 300,
      tableCapacity: 10,
      firstDish: 'Osh',
      secondDish: 'Qozon kabob',
      hallName: 'Oltin zal',
      menu: {
        name: 'Premium',
        sections: [{ nameUz: 'Salatlar', kindsCount: 4, items: ['Sezar', 'Olivye'] }],
      },
      lists: [{ id: list.id, status: 'SUBMITTED' }],
    });
    expect(JSON.stringify(seen)).not.toMatch(/totalAmount|paidAmount|pricePerGuest|998901234567/);

    // Xaridchi (admin) ro'yxatni super admin yubormaguncha ko'rmaydi.
    expect((await kitchen(buyer))[0]).toMatchObject({ lists: [], shoppingClosed: false });

    // Super admin kamaytiradi, bittasini olib tashlaydi, yangisini qo'shadi.
    await as(cook).post(`/shopping/lists/${list.id}/approve`).expect(403);
    const reviewed = await data(
      as(admin)
        .put(`/shopping/lists/${list.id}`, {
          items: [
            { id: list.items[0].id, name: 'Kartoshka', unit: 'KG', quantity: '30' },
            { id: list.items[2].id, name: 'Aysberg salat', unit: 'PIECE', quantity: '6' },
            { name: 'Pomidor', unit: 'KG', quantity: '12.5' },
          ],
        })
        .expect(200),
    );
    expect(
      reviewed.items.map((item: { name: string; quantity: string; requestedQuantity: string }) => [
        item.name,
        item.quantity,
        item.requestedQuantity,
      ]),
    ).toEqual([
      ['Kartoshka', '30', '40'],
      ['Aysberg salat', '6', null],
      ['Pomidor', '12.5', null],
    ]);

    await as(buyer)
      .put(`/shopping/lists/${list.id}/purchase`, {
        items: prices(reviewed, ['1', '1', '1']),
        complete: true,
      })
      .expect(409);
    const approved = await data(as(admin).post(`/shopping/lists/${list.id}/approve`).expect(200));
    expect(approved.status).toBe('APPROVED');
    expect((await kitchen(buyer))[0].lists).toMatchObject([{ id: list.id, status: 'APPROVED' }]);
    // Ko'rib chiqilgan ro'yxatni oshpaz endi o'zgartira olmaydi.
    const locked = await as(cook).put(`/shopping/lists/${list.id}`, { items: ITEMS }).expect(409);
    expect(locked.body.error.code).toBe('SHOPPING_LIST_LOCKED');
    await as(cook).del(`/shopping/lists/${list.id}`).expect(409);

    // Admin: oraliq saqlash, keyin yakunlash (bitta mahsulot topilmadi).
    await as(cook)
      .put(`/shopping/lists/${list.id}/purchase`, {
        items: prices(approved, ['1', '1', '1']),
        complete: true,
      })
      .expect(403);
    const partial = await data(
      as(buyer)
        .put(`/shopping/lists/${list.id}/purchase`, {
          items: [{ id: approved.items[0].id, quantity: '32', price: '160000' }],
          complete: false,
        })
        .expect(200),
    );
    expect(partial).toMatchObject({ status: 'APPROVED', total: '160000.00' });
    const missing = await as(buyer)
      .put(`/shopping/lists/${list.id}/purchase`, {
        items: [{ id: approved.items[1].id, quantity: '6', skipped: true }],
        complete: true,
      })
      .expect(400);
    expect(missing.body.error).toMatchObject({
      code: 'SHOPPING_PRICES_MISSING',
      details: { items: ['Pomidor'] },
    });

    const purchased = await data(
      as(buyer)
        .put(`/shopping/lists/${list.id}/purchase`, {
          items: prices(partial, ['160000', null, '187500.50']),
          complete: true,
        })
        .expect(200),
    );
    expect(purchased).toMatchObject({
      status: 'PURCHASED',
      purchasedByName: 'Admin Vali',
      total: '347500.50',
    });
    expect(purchased.items[0]).toMatchObject({
      quantity: '32',
      requestedQuantity: '40',
      price: '160000.00',
    });
    expect(purchased.items[1]).toMatchObject({ skipped: true, price: null });

    // Bozorlik qilib bo'lingach, bu to'yga yangi ro'yxat yozilmaydi.
    expect((await kitchen(cook))[0].shoppingClosed).toBe(true);
    const closed = await as(cook)
      .post(`/shopping/events/${event.id}/lists`, { items: ITEMS })
      .expect(409);
    expect(closed.body.error.code).toBe('SHOPPING_CLOSED');

    // Tasdiqlanmaguncha sof foydadan ayirilmaydi.
    const before = await finance();
    expect(before.totals.expenses).toBe('0.00');
    expect(before.pendingShopping).toEqual({ count: 1, total: '347500.50' });

    await as(buyer).post(`/shopping/lists/${list.id}/confirm`).expect(403);
    const confirmed = await data(as(admin).post(`/shopping/lists/${list.id}/confirm`).expect(200));
    expect(confirmed.status).toBe('CONFIRMED');

    const after = await finance();
    expect(after.totals).toMatchObject({ expenses: '347500.50', profit: '-347500.50' });
    expect(after.pendingShopping).toEqual({ count: 0, total: '0.00' });
    expect(after.expensesByCategory).toEqual([
      expect.objectContaining({ name: 'Bozorlik', amount: '347500.50' }),
    ]);

    // Xarajat to'y kuniga yozilgan va faqat Bozorlik bo'limi orqali o'zgaradi.
    const [expense] = await data(as(admin).get('/finance/expenses'));
    expect(expense).toMatchObject({
      amount: '347500.50',
      date: day(0),
      fromShopping: true,
      event: { number: 1, title: 'Anvar va Nodira to‘yi' },
      note: 'Bron № 1 — Anvar va Nodira to‘yi (Oshpaz Ali)',
    });
    const linked = await as(admin)
      .patch(`/finance/expenses/${expense.id}`, { amount: '1' })
      .expect(409);
    expect(linked.body.error.code).toBe('EXPENSE_LINKED');
    await as(admin).del(`/finance/expenses/${expense.id}`).expect(409);
    await as(admin).del(`/shopping/lists/${list.id}`).expect(409);

    // Tasdiqni bekor qilish → narxni tuzatish → qayta tasdiqlash.
    await as(admin).post(`/shopping/lists/${list.id}/unconfirm`).expect(200);
    expect((await finance()).totals.expenses).toBe('0.00');
    const fixed = await data(
      as(admin)
        .put(`/shopping/lists/${list.id}/purchase`, {
          items: prices(purchased, ['150000', null, '187500.50']),
          complete: true,
        })
        .expect(200),
    );
    expect(fixed).toMatchObject({
      status: 'PURCHASED',
      total: '337500.50',
      purchasedByName: 'Admin Vali',
    });
    await as(admin).post(`/shopping/lists/${list.id}/confirm`).expect(200);
    expect((await finance()).totals.expenses).toBe('337500.50');

    const [card] = await kitchen();
    expect(card).toMatchObject({ total: '337500.50', lists: [{ status: 'CONFIRMED' }] });
    const audit = await as(admin).get('/audit-logs?resource=shopping_list').expect(200);
    expect(audit.body.data.map((row: { action: string }) => row.action)).toEqual([
      'shopping.confirm',
      'shopping.prices_update',
      'shopping.unconfirm',
      'shopping.confirm',
      'shopping.purchase',
      'shopping.approve',
      'shopping.update',
      'shopping.create',
    ]);
  });

  it('bozorlik to‘y kunidan oldin qilinmaydi', async () => {
    const event = await book(2);
    const list = await writeList(event.id);
    await as(admin).post(`/shopping/lists/${list.id}/approve`).expect(200);

    const early = await as(buyer)
      .put(`/shopping/lists/${list.id}/purchase`, {
        items: prices(list, ['1000', '1000', '1000']),
        complete: true,
      })
      .expect(409);
    expect(early.body.error).toMatchObject({
      code: 'SHOPPING_TOO_EARLY',
      details: { day: day(2) },
    });
  });

  it('oshpaz: o‘z ro‘yxatini tuzatadi va o‘chiradi, birovnikiga tegmaydi, boshqa bo‘limlarga kirmaydi', async () => {
    const event = await book(1);
    const list = await writeList(event.id);
    const other = await t.createActiveUser(admin, {
      email: 'oshpaz2@gavhar.test',
      fullName: 'Oshpaz Bobur',
      roleId: await t.roleId('COOK'),
    });

    const edited = await data(
      as(cook)
        .put(`/shopping/lists/${list.id}`, {
          items: [{ id: list.items[0].id, name: 'Kartoshka', unit: 'KG', quantity: '45' }],
          note: ' Yangi hosil ',
        })
        .expect(200),
    );
    // Oshpazning o'z tuzatishi "o'zgartirilgan" deb ko'rsatilmaydi.
    expect(edited).toMatchObject({
      note: 'Yangi hosil',
      items: [{ quantity: '45', requestedQuantity: null }],
    });

    await as(other).put(`/shopping/lists/${list.id}`, { items: ITEMS }).expect(403);
    await as(other).del(`/shopping/lists/${list.id}`).expect(403);
    // Ikkinchi oshpaz o'z ro'yxatini yozadi — bir to'yga bir nechta ro'yxat bo'lishi mumkin.
    // Har bir oshpaz faqat o'zinikini ko'radi, super admin — hammasini.
    await writeList(event.id, other);
    expect((await kitchen(other))[0].lists).toMatchObject([{ createdByName: 'Oshpaz Bobur' }]);
    expect((await kitchen(cook))[0].lists).toMatchObject([{ createdByName: 'Oshpaz Ali' }]);
    expect((await kitchen())[0].lists).toHaveLength(2);

    for (const path of ['/events', '/finance/expenses', '/clients', '/warehouse/items', '/halls']) {
      await as(cook).get(path).expect(403);
    }
    await as(cook)
      .get(`/finance/summary?from=${day(0)}&to=${day(0)}`)
      .expect(403);

    await as(cook).del(`/shopping/lists/${list.id}`).expect(204);
    expect((await kitchen())[0].lists).toHaveLength(1);
    expect(await data(as(cook).get('/shopping/suggestions'))).toEqual(
      expect.arrayContaining([{ name: 'Kartoshka', unit: 'KG' }]),
    );
  });

  it('validatsiya: bo‘sh, takroriy va noto‘g‘ri miqdorli ro‘yxat rad etiladi', async () => {
    const event = await book(1);
    const send = (items: object[]) =>
      as(cook).post(`/shopping/events/${event.id}/lists`, { items });

    await send([]).expect(400);
    await send([{ name: 'Tuxum', unit: 'PIECE', quantity: '0' }]).expect(400);
    await send([{ name: 'Tuxum', unit: 'DOZEN', quantity: '1' }]).expect(400);
    const whole = await send([{ name: 'Tuxum', unit: 'PIECE', quantity: '10.5' }]).expect(400);
    expect(whole.body.error.code).toBe('QUANTITY_MUST_BE_WHOLE');
    // Bir xil mahsulot ikki marta yozilsa, bitta qatorga qo'shiladi (birligi boshqa bo'lsa — yo'q).
    const merged = await send([
      { name: 'Piyoz', unit: 'KG', quantity: '5' },
      { name: ' piyoz ', unit: 'KG', quantity: '3.5' },
      { name: 'Piyoz', unit: 'PIECE', quantity: '2' },
    ]).expect(201);
    expect(
      merged.body.data.items.map((item: { name: string; unit: string; quantity: string }) => [
        item.name,
        item.unit,
        item.quantity,
      ]),
    ).toEqual([
      ['Piyoz', 'KG', '8.5'],
      ['Piyoz', 'PIECE', '2'],
    ]);
    await as(cook)
      .post('/shopping/events/00000000-0000-4000-8000-000000000000/lists', { items: ITEMS })
      .expect(404);
  });

  it('umumiy bozorlik: to‘yga bog‘lanmaydi, kunidan qat’i nazar xarid qilinadi; qatorga izoh; kutilayotganlar soni', async () => {
    const list = await data(
      as(cook)
        .post('/shopping/lists', {
          items: [
            { name: 'Tuz', unit: 'PACK', quantity: '10', note: ' yirik ' },
            { name: 'Salfetka', unit: 'BOX', quantity: '4' },
            { name: 'tuz', unit: 'PACK', quantity: '5', note: 'yodlangan' },
          ],
        })
        .expect(201),
    );
    expect(list).toMatchObject({ eventId: null, status: 'SUBMITTED' });
    expect(
      list.items.map((item: { name: string; quantity: string; note: string | null }) => [
        item.name,
        item.quantity,
        item.note,
      ]),
    ).toEqual([
      ['Tuz', '15', 'yirik; yodlangan'],
      ['Salfetka', '4', null],
    ]);

    // Kimdan nima kutilmoqda: avval super admin, yuborilgach — xaridchi.
    expect(await data(as(admin).get('/shopping/pending'))).toEqual({
      toReview: 1,
      toConfirm: 0,
      toPurchase: 0,
    });
    expect(await data(as(buyer).get('/shopping/pending'))).toEqual({
      toReview: 0,
      toConfirm: 0,
      toPurchase: 0,
    });
    expect(await data(as(cook).get('/shopping/pending'))).toEqual({
      toReview: 0,
      toConfirm: 0,
      toPurchase: 0,
    });
    expect(await data(as(buyer).get('/shopping/lists/general'))).toEqual([]);
    expect(await data(as(cook).get('/shopping/lists/general'))).toHaveLength(1);

    await as(admin).post(`/shopping/lists/${list.id}/approve`).expect(200);
    expect(await data(as(buyer).get('/shopping/pending'))).toMatchObject({ toPurchase: 1 });
    expect(await data(as(buyer).get('/shopping/lists/general'))).toMatchObject([{ id: list.id }]);

    await as(buyer)
      .put(`/shopping/lists/${list.id}/purchase`, {
        items: prices(list, ['45000', '120000']),
        complete: true,
      })
      .expect(200);
    expect(await data(as(admin).get('/shopping/pending'))).toEqual({
      toReview: 0,
      toConfirm: 1,
      toPurchase: 0,
    });
    await as(admin).post(`/shopping/lists/${list.id}/confirm`).expect(200);

    const [expense] = await data(as(admin).get('/finance/expenses'));
    expect(expense).toMatchObject({
      amount: '165000.00',
      date: day(0),
      event: null,
      fromShopping: true,
      note: 'Umumiy bozorlik (Oshpaz Ali)',
    });

    const pdf = await as(cook).get(`/shopping/lists/${list.id}/pdf`).expect(200);
    expect(pdf.headers['content-disposition']).toContain('bozorlik-umumiy.pdf');
    // To'y kartalariga umumiy ro'yxat aralashmaydi.
    expect(await kitchen()).toEqual([]);
  });

  it('bir vaqtda kelgan ikki tasdiq bitta xarajat yozadi', async () => {
    const event = await book(0);
    const list = await writeList(event.id);
    await as(admin).post(`/shopping/lists/${list.id}/approve`).expect(200);
    await as(buyer)
      .put(`/shopping/lists/${list.id}/purchase`, {
        items: prices(list, ['100000', '50000', '30000']),
        complete: true,
      })
      .expect(200);

    const results = await Promise.all([
      as(admin).post(`/shopping/lists/${list.id}/confirm`),
      as(admin).post(`/shopping/lists/${list.id}/confirm`),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    expect(await data(as(admin).get('/finance/expenses'))).toHaveLength(1);
    expect((await finance()).totals.expenses).toBe('180000.00');
  });

  it('PDF: ro‘yxat chop etish uchun yuklab olinadi', async () => {
    const event = await book(0);
    const list = await writeList(event.id);

    const res = await as(cook)
      .get(`/shopping/lists/${list.id}/pdf`)
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('bozorlik-1.pdf');
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });
});
