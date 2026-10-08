import sharp from 'sharp';
import { Response } from 'supertest';
import { localDate } from '../src/common/utils/app-date.util';
import { ActiveSuperAdmin, TestApp } from './utils/test-app';

const DAY = 86_400_000;
const TZ = 'Asia/Tashkent';
/** Toshkent bo'yicha bugundan `days` kun naridagi sana. */
const day = (days = 0): string => localDate(new Date(Date.now() + days * DAY), TZ);
/** O'sha kunning Toshkent vaqti bilan 08:00–09:00 oralig'i (o'tgan kunlar uchun — aniq o'tmish). */
const slot = (days: number, hour = 8) => {
  const start = new Date(`${day(days)}T${String(hour).padStart(2, '0')}:00:00+05:00`);
  return {
    startAt: start.toISOString(),
    endAt: new Date(start.getTime() + 3_600_000).toISOString(),
  };
};

describe('Hisob-kitob va ombor (e2e)', () => {
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

  const post = (path: string, body: object = {}) =>
    t.http().post(`/api/v1${path}`).set(admin.auth).send(body);
  const patch = (path: string, body: object = {}) =>
    t.http().patch(`/api/v1${path}`).set(admin.auth).send(body);
  const get = (path: string) => t.http().get(`/api/v1${path}`).set(admin.auth);
  const del = (path: string) => t.http().delete(`/api/v1${path}`).set(admin.auth);
  const data = async (req: PromiseLike<Response>) => (await req).body.data;
  const summary = (from: string, to: string, groupBy = 'day') =>
    data(get(`/finance/summary?from=${from}&to=${to}&groupBy=${groupBy}`).expect(200));

  describe('hisob-kitob', () => {
    let clientId: string;
    let hallId: string;
    let categoryId: string;

    beforeEach(async () => {
      clientId = (
        await data(post('/clients', { fullName: 'Karimov Anvar', phone: '+998901234567' }))
      ).id;
      hallId = (await data(post('/halls', { name: 'Oltin zal', capacity: 400 }))).id;
      categoryId = (await data(post('/finance/categories', { name: 'Ish haqi' }).expect(201))).id;
    });

    const book = async (days: number, paid: string | null, guestCount = 100) => {
      const event = await data(
        post('/events', {
          clientId,
          hallId,
          type: 'WEDDING',
          guestCount,
          pricePerGuest: '200000',
          ...slot(days),
        }).expect(201),
      );
      if (paid) {
        await post(`/events/${event.id}/payments`, {
          kind: 'DEPOSIT',
          method: 'CASH',
          currency: 'UZS',
          amount: paid,
        }).expect(201);
      }
      return event;
    };

    it('faqat bo‘lib o‘tgan to‘ylar hisoblanadi; kelajakdagilar alohida ko‘rsatiladi', async () => {
      await book(-3, '20000000'); // o'tgan, to'liq to'langan: 100 × 200 000
      await book(-1, '5000000'); // o'tgan, 15 mln qarz
      await book(4, '8000000', 150); // kelajakda — hisobga kirmaydi
      await post('/finance/expenses', { categoryId, amount: '6000000', date: day(-2) }).expect(201);
      await post('/finance/expenses', {
        categoryId,
        amount: '1500000.50',
        date: day(0),
        note: 'Gaz',
      }).expect(201);

      const result = await summary(day(-6), day(6));

      expect(result.totals).toEqual({
        income: '25000000.00',
        eventsIncome: '25000000.00',
        retainedDeposits: '0.00',
        expenses: '7500000.50',
        profit: '17499999.50',
        accrued: '40000000.00',
        debt: '15000000.00',
        eventsCount: 2,
        guestsCount: 200,
      });
      expect(result.upcoming).toEqual({ count: 1, total: '30000000.00', paid: '8000000.00' });
      expect(result.range).toEqual({ from: day(-6), to: day(6), countedUntil: day(0) });

      // Grafik: davrning har kuni bor, kelajak kunlari bo'sh.
      expect(result.series).toHaveLength(13);
      const point = (key: string) =>
        result.series.find((item: { key: string }) => item.key === key);
      expect(point(day(-3))).toMatchObject({ income: '20000000.00', expense: '0.00' });
      expect(point(day(-2))).toMatchObject({ income: '0.00', profit: '-6000000.00' });
      expect(point(day(4))).toMatchObject({ income: '0.00', expense: '0.00' });

      expect(result.events.map((event: { debt: string }) => event.debt)).toEqual([
        '15000000.00',
        '0.00',
      ]);
      expect(result.expensesByCategory).toEqual([
        { id: categoryId, name: 'Ish haqi', amount: '7500000.50' },
      ]);
    });

    it('bugungi to‘y kun boshidan hisobga kiradi; bekor qilingan to‘yning qolgan zakladi — o‘z kunining tushumi', async () => {
      // Bugun kechqurun bo'ladigan to'y: soati kelmagan bo'lsa ham bugungi hisobda.
      const tonight = new Date(`${day(0)}T23:30:00+05:00`);
      const today = await data(
        post('/events', {
          clientId,
          hallId,
          type: 'WEDDING',
          guestCount: 100,
          pricePerGuest: '200000',
          startAt: tonight.toISOString(),
          endAt: new Date(tonight.getTime() + 20 * 60_000).toISOString(),
        }).expect(201),
      );
      await post(`/events/${today.id}/payments`, {
        kind: 'DEPOSIT',
        method: 'CASH',
        currency: 'UZS',
        amount: '6000000',
      }).expect(201);
      const future = await book(5, '4000000');

      const before = await summary(day(-1), day(10));
      expect(before.totals).toMatchObject({ income: '6000000.00', eventsCount: 1 });
      expect(before.upcoming).toMatchObject({ count: 1, paid: '4000000.00' });

      // Kechagi to'y bekor bo'lgan: 1 mln qaytarildi, 3 mln to'yxonada qoldi.
      const past = await book(-1, '4000000');
      await post(`/events/${past.id}/cancel`, { reason: 'Mijoz voz kechdi' }).expect(200);
      await post(`/events/${past.id}/payments`, {
        kind: 'REFUND',
        method: 'CASH',
        currency: 'UZS',
        amount: '1000000',
      }).expect(201);
      // Kelajakdagi to'y ham bekor bo'ldi — uning zakladi kuni kelmaguncha hisobga kirmaydi.
      await post(`/events/${future.id}/cancel`, { reason: 'Ko‘chirildi' }).expect(200);

      const after = await summary(day(-1), day(10));
      expect(after.totals).toMatchObject({
        income: '9000000.00',
        eventsIncome: '6000000.00',
        retainedDeposits: '3000000.00',
        eventsCount: 1,
      });
      expect(after.upcoming).toEqual({ count: 0, total: '0.00', paid: '0.00' });
      expect(after.series.find((item: { key: string }) => item.key === day(-1))).toMatchObject({
        income: '3000000.00',
      });
    });

    it('to‘y xarajati to‘y kuniga yoziladi va shu to‘yning sof foydasidan ayiriladi', async () => {
      const held = await book(-2, '20000000');
      const upcoming = await book(6, '5000000');
      const artist = (await data(post('/finance/categories', { name: 'San’atkor' }))).id;

      // Sana yuborilmaydi — to'y kuni olinadi.
      const expense = await data(
        post('/finance/expenses', {
          categoryId: artist,
          amount: '3000000',
          eventId: held.id,
        }).expect(201),
      );
      expect(expense).toMatchObject({
        date: day(-2),
        event: { id: held.id, number: held.number },
        category: { name: 'San’atkor' },
      });
      await post('/finance/expenses', { categoryId, amount: '1500000', eventId: held.id }).expect(
        201,
      );
      // Kelajakdagi to'yga ham xarajat yozsa bo'ladi — kuni kelguncha hisobga kirmaydi.
      await post('/finance/expenses', {
        categoryId: artist,
        amount: '2000000',
        eventId: upcoming.id,
      }).expect(201);
      // Umumiy xarajatga sana shart.
      await post('/finance/expenses', { categoryId, amount: '1000' }).expect(400);
      await post('/finance/expenses', {
        categoryId,
        amount: '1000',
        eventId: '00000000-0000-4000-8000-000000000000',
      }).expect(404);

      const one = await data(get(`/finance/events/${held.id}`).expect(200));
      expect(one).toMatchObject({
        paidAmount: '20000000.00',
        expensesTotal: '4500000.00',
        netProfit: '15500000.00',
      });
      expect(one.expenses).toHaveLength(2);

      const result = await summary(day(-6), day(10));
      expect(result.totals).toMatchObject({
        income: '20000000.00',
        expenses: '4500000.00',
        profit: '15500000.00',
      });
      expect(result.events).toMatchObject([
        { id: held.id, expenses: '4500000.00', netProfit: '15500000.00' },
      ]);
      expect((await get(`/finance/expenses?eventId=${held.id}`).expect(200)).body.meta.total).toBe(
        2,
      );

      // To'y xarajatining sanasi qo'lda o'zgartirilmaydi; to'y ko'chsa, xarajat ham ko'chadi.
      const fixed = await patch(`/finance/expenses/${expense.id}`, { date: day(-1) }).expect(400);
      expect(fixed.body.error.code).toBe('EXPENSE_EVENT_DATE_FIXED');
      await patch(`/events/${held.id}`, slot(-4)).expect(200);
      const moved = await data(get(`/finance/events/${held.id}`));
      expect(moved.expenses.map((item: { date: string }) => item.date)).toEqual([day(-4), day(-4)]);
    });

    it('yil ko‘rinishi oylar bo‘yicha jamlanadi; noto‘g‘ri davr rad etiladi', async () => {
      await book(-2, '20000000');
      const year = day(0).slice(0, 4);
      const result = await summary(`${year}-01-01`, `${year}-12-31`, 'month');
      expect(result.series).toHaveLength(12);
      expect(result.totals.income).toBe('20000000.00');

      for (const query of [
        `from=${year}-01-01&to=${year}-12-31&groupBy=day`, // kunlik uchun juda uzun
        `from=${day(2)}&to=${day(1)}`,
        `from=2026-02-30&to=2026-03-01`,
        `from=${Number(year) - 2}-01-01&to=${year}-12-31&groupBy=month`,
      ]) {
        const res = await get(`/finance/summary?${query}`).expect(400);
        expect(res.body.error.code).toBe('INVALID_DATE_RANGE');
      }
    });

    it('xarajat: kelajak sanasi qabul qilinmaydi; tahrirlanadi, o‘chiriladi, filtrlanadi', async () => {
      const future = await post('/finance/expenses', {
        categoryId,
        amount: '100000',
        date: day(1),
      }).expect(400);
      expect(future.body.error.code).toBe('EXPENSE_DATE_IN_FUTURE');
      await post('/finance/expenses', { categoryId, amount: '0', date: day(0) }).expect(400);
      await post('/finance/expenses', { categoryId, amount: '-5', date: day(0) }).expect(400);

      const expense = await data(
        post('/finance/expenses', { categoryId, amount: '900000', date: day(-1), note: ' Svet ' }),
      );
      expect(expense).toMatchObject({
        amount: '900000.00',
        date: day(-1),
        note: 'Svet',
        fromShopping: false,
        category: { name: 'Ish haqi' },
      });

      const updated = await data(
        patch(`/finance/expenses/${expense.id}`, { amount: '950000', date: day(0) }).expect(200),
      );
      expect(updated).toMatchObject({ amount: '950000.00', date: day(0) });

      const listed = await get(`/finance/expenses?from=${day(0)}&to=${day(0)}`).expect(200);
      expect(listed.body.meta.total).toBe(1);
      expect((await get(`/finance/expenses?to=${day(-1)}`).expect(200)).body.meta.total).toBe(0);

      await del(`/finance/expenses/${expense.id}`).expect(204);
      expect((await summary(day(-3), day(0))).totals.expenses).toBe('0.00');

      const audit = await get('/audit-logs?resource=expense').expect(200);
      expect(audit.body.data.map((row: { action: string }) => row.action)).toEqual([
        'expense.delete',
        'expense.update',
        'expense.create',
      ]);
    });

    it('xarajat turlari: nom takrorlanmaydi; o‘chirilgan tur eski xarajatda qoladi', async () => {
      await post('/finance/categories', { name: 'ish HAQI' }).expect(409);
      const expense = await data(
        post('/finance/expenses', { categoryId, amount: '1000', date: day(0) }),
      );
      await patch(`/finance/categories/${categoryId}`, { name: 'Oylik' }).expect(200);
      await del(`/finance/categories/${categoryId}`).expect(204);

      expect(await data(get('/finance/categories'))).toEqual([]);
      const listed = await data(get('/finance/expenses'));
      expect(listed[0]).toMatchObject({ id: expense.id, category: { name: 'Oylik' } });
      await post('/finance/expenses', { categoryId, amount: '1000', date: day(0) }).expect(404);
    });

    it('ruxsat: Admin pulni ko‘rmaydi; moliya ruxsati berilgan rol xarajat yozadi, turlarni boshqarmaydi', async () => {
      const manager = await t.createActiveUser(admin, {
        email: 'admin2@gavhar.test',
        fullName: 'Ikkinchi Admin',
        roleId: await t.roleId('ADMIN'),
      });
      await manager.agent
        .get(`/api/v1/finance/summary?from=${day(-1)}&to=${day(0)}`)
        .set(manager.auth)
        .expect(403);
      await manager.agent
        .post('/api/v1/finance/expenses')
        .set(manager.auth)
        .send({ categoryId, amount: '5000', date: day(0) })
        .expect(403);

      const accountantRole = await data(
        post('/roles', {
          name: 'Hisobchi',
          permissions: ['finance:read', 'finance:create'],
        }).expect(201),
      );
      const accountant = await t.createActiveUser(admin, {
        email: 'hisobchi@gavhar.test',
        fullName: 'Hisobchi Xodim',
        roleId: accountantRole.id,
      });
      await accountant.agent
        .get(`/api/v1/finance/summary?from=${day(-1)}&to=${day(0)}`)
        .set(accountant.auth)
        .expect(200);
      await accountant.agent
        .post('/api/v1/finance/expenses')
        .set(accountant.auth)
        .send({ categoryId, amount: '5000', date: day(0) })
        .expect(201);
      await accountant.agent
        .post('/api/v1/finance/categories')
        .set(accountant.auth)
        .send({ name: 'Yangi tur' })
        .expect(403);

      const role = await data(
        post('/roles', {
          name: 'Omborchi',
          permissions: ['warehouse:read', 'warehouse:update'],
        }).expect(201),
      );
      const keeper = await t.createActiveUser(admin, {
        email: 'ombor@gavhar.test',
        fullName: 'Ombor Mudiri',
        roleId: role.id,
      });
      await keeper.agent
        .get(`/api/v1/finance/summary?from=${day(-1)}&to=${day(0)}`)
        .set(keeper.auth)
        .expect(403);
      await keeper.agent.get('/api/v1/finance/expenses').set(keeper.auth).expect(403);
      await keeper.agent.get('/api/v1/warehouse/items').set(keeper.auth).expect(200);
      await keeper.agent
        .post('/api/v1/warehouse/items')
        .set(keeper.auth)
        .send({ section: 'FOOD', name: 'Un', unit: 'KG' })
        .expect(403);
    });
  });

  describe('ombor', () => {
    const createItem = (body: object) => data(post('/warehouse/items', body).expect(201));
    const move = (id: string, body: object) => post(`/warehouse/items/${id}/movements`, body);

    it('ikki bo‘lim: idish-tovoq va oziq-ovqat; boshlang‘ich qoldiq tarixga yoziladi', async () => {
      const plates = await createItem({
        section: 'TABLEWARE',
        name: 'Chuqur likopcha',
        unit: 'PIECE',
        initialQuantity: '600',
        minQuantity: '100',
      });
      await createItem({ section: 'FOOD', name: 'Guruch', unit: 'KG', initialQuantity: '12.5' });
      // Nom faqat o'z bo'limi ichida takrorlanmaydi.
      await createItem({ section: 'FOOD', name: 'Chuqur likopcha', unit: 'PIECE' });
      await post('/warehouse/items', { section: 'FOOD', name: 'guruch', unit: 'KG' }).expect(409);

      expect(plates).toMatchObject({ quantity: '600', minQuantity: '100', isLow: false });
      const tableware = await data(get('/warehouse/items?section=TABLEWARE'));
      expect(tableware.map((item: { name: string }) => item.name)).toEqual(['Chuqur likopcha']);
      expect(await data(get('/warehouse/items'))).toHaveLength(3);

      const history = await get(`/warehouse/items/${plates.id}/movements`).expect(200);
      expect(history.body.data).toMatchObject([
        { type: 'IN', quantity: '600', balanceAfter: '600', createdByName: 'Test Root' },
      ]);
    });

    it('kirim qo‘shadi, chiqim kamaytiradi; qoldiqdan ko‘p chiqarib bo‘lmaydi', async () => {
      const rice = await createItem({
        section: 'FOOD',
        name: 'Guruch',
        unit: 'KG',
        initialQuantity: '50',
        minQuantity: '20',
      });

      const added = await data(move(rice.id, { type: 'IN', quantity: '25,5' }).expect(201));
      expect(added).toMatchObject({ quantity: '75.5', isLow: false });

      const used = await data(
        move(rice.id, { type: 'OUT', quantity: '60', note: 'Shanba to‘yi' }).expect(201),
      );
      expect(used).toMatchObject({ quantity: '15.5', isLow: true });

      const over = await move(rice.id, { type: 'OUT', quantity: '15.501' }).expect(409);
      expect(over.body.error).toMatchObject({
        code: 'INSUFFICIENT_STOCK',
        details: { available: '15.5' },
      });
      await move(rice.id, { type: 'OUT', quantity: '0' }).expect(400);
      await move(rice.id, { type: 'OUT', quantity: '-3' }).expect(400);
      await move(rice.id, { type: 'OUT', quantity: '1', totalCost: '5000' }).expect(400);

      const history = await data(get(`/warehouse/items/${rice.id}/movements`));
      expect(
        history.map((row: { type: string; quantity: string; balanceAfter: string }) => [
          row.type,
          row.quantity,
          row.balanceAfter,
        ]),
      ).toEqual([
        ['OUT', '60', '15.5'],
        ['IN', '25.5', '75.5'],
        ['IN', '50', '50'],
      ]);
    });

    it('donalab sanaladigan mahsulotda kasr miqdor rad etiladi', async () => {
      const glasses = await createItem({ section: 'TABLEWARE', name: 'Piyola', unit: 'PIECE' });
      const res = await move(glasses.id, { type: 'IN', quantity: '10.5' }).expect(400);
      expect(res.body.error.code).toBe('QUANTITY_MUST_BE_WHOLE');
      await post('/warehouse/items', {
        section: 'TABLEWARE',
        name: 'Qoshiq',
        unit: 'PIECE',
        initialQuantity: '1.5',
      }).expect(400);
    });

    it('xarid summasi tarixda saqlanadi, lekin hisob-kitobga qo‘shilmaydi', async () => {
      const meat = await createItem({ section: 'FOOD', name: 'Mol go‘shti', unit: 'KG' });
      await move(meat.id, { type: 'IN', quantity: '40', totalCost: '4400000' }).expect(201);

      const history = await data(get(`/warehouse/items/${meat.id}/movements`));
      expect(history[0]).toMatchObject({ type: 'IN', quantity: '40', totalCost: '4400000.00' });

      // Ombor xaridlari alohida yuritiladi: xarajat ham, sof foyda ham o'zgarmaydi.
      expect(await data(get('/finance/expenses'))).toEqual([]);
      expect(await data(get('/finance/categories'))).toEqual([]);
      const result = await summary(day(-1), day(0));
      expect(result.totals).toMatchObject({ expenses: '0.00', profit: '0.00' });
    });

    it('inventarizatsiya farqni kirim yoki chiqim qilib yozadi; so‘nggi harakatlar lentasi', async () => {
      const rice = await createItem({
        section: 'FOOD',
        name: 'Guruch',
        unit: 'KG',
        initialQuantity: '50',
        productCategory: 'GRAIN',
      });
      expect(rice).toMatchObject({ productCategory: 'GRAIN', photo: null });
      // Idish-tovoqda mahsulot turi bo'lmaydi.
      const plates = await createItem({
        section: 'TABLEWARE',
        name: 'Likopcha',
        unit: 'PIECE',
        initialQuantity: '100',
        productCategory: 'MEAT',
      });
      expect(plates.productCategory).toBeNull();

      const less = await data(
        post(`/warehouse/items/${rice.id}/count`, { actual: '46.5', note: 'Oy oxiri' }).expect(200),
      );
      expect(less.quantity).toBe('46.5');
      const more = await data(
        post(`/warehouse/items/${plates.id}/count`, { actual: '104' }).expect(200),
      );
      expect(more.quantity).toBe('104');
      // Farq bo'lmasa, harakat yozilmaydi.
      await post(`/warehouse/items/${plates.id}/count`, { actual: '104' }).expect(200);
      await post(`/warehouse/items/${plates.id}/count`, { actual: '10.5' }).expect(400);

      const feed = await data(get('/warehouse/items/recent-movements?limit=3'));
      expect(
        feed.map(
          (row: { item: { name: string }; type: string; quantity: string; note: string }) => [
            row.item.name,
            row.type,
            row.quantity,
            row.note,
          ],
        ),
      ).toEqual([
        ['Likopcha', 'IN', '4', 'Inventarizatsiya'],
        ['Guruch', 'OUT', '3.5', 'Inventarizatsiya: Oy oxiri'],
        ['Likopcha', 'IN', '100', 'Boshlang‘ich qoldiq'],
      ]);

      // Qoldig'i bor mahsulotning birligi o'zgarmaydi; 0 ga tushgach — mumkin.
      const locked = await patch(`/warehouse/items/${rice.id}`, { unit: 'PACK' }).expect(409);
      expect(locked.body.error.code).toBe('UNIT_CHANGE_WITH_STOCK');
      await post(`/warehouse/items/${rice.id}/count`, { actual: '0' }).expect(200);
      await patch(`/warehouse/items/${rice.id}`, { unit: 'PACK', productCategory: 'OTHER' }).expect(
        200,
      );
    });

    it('mahsulot rasmi yuklanadi va almashtiriladi; ombor katalogi bozorlik takliflarida chiqadi', async () => {
      const meat = await createItem({ section: 'FOOD', name: 'Mol go‘shti', unit: 'KG' });
      await createItem({ section: 'TABLEWARE', name: 'Piyola', unit: 'PIECE' });
      const png = await sharp({
        create: { width: 900, height: 600, channels: 3, background: '#7a1f3d' },
      })
        .png()
        .toBuffer();
      const upload = () =>
        t
          .http()
          .post(`/api/v1/warehouse/items/${meat.id}/photo`)
          .set(admin.auth)
          .attach('file', png, { filename: 'gosht.png', contentType: 'image/png' });

      const first = (await upload().expect(201)).body.data;
      expect(first.photo.url).toContain('.webp');
      expect((await fetch(first.photo.thumbUrl)).status).toBe(200);
      const second = (await upload().expect(201)).body.data;
      expect(second.photo.url).not.toBe(first.photo.url);

      const fake = await t
        .http()
        .post(`/api/v1/warehouse/items/${meat.id}/photo`)
        .set(admin.auth)
        .attach('file', Buffer.from('<?php echo 1; ?>'), {
          filename: 'x.png',
          contentType: 'image/png',
        })
        .expect(400);
      expect(fake.body.error.code).toBe('INVALID_IMAGE');

      const cleared = await data(del(`/warehouse/items/${meat.id}/photo`).expect(200));
      expect(cleared.photo).toBeNull();

      // Oshpaz bozorlik yozganda ombordagi oziq-ovqat nomlari taklif qilinadi (idish emas).
      expect(await data(get('/shopping/suggestions'))).toEqual([
        { name: 'Mol go‘shti', unit: 'KG' },
      ]);
    });

    it('bir vaqtda kelgan chiqimlar qoldiqni manfiyga tushirmaydi', async () => {
      const chairs = await createItem({
        section: 'TABLEWARE',
        name: 'Stul g‘ilofi',
        unit: 'PIECE',
        initialQuantity: '10',
      });

      const results = await Promise.all(
        Array.from({ length: 6 }, () => move(chairs.id, { type: 'OUT', quantity: '3' })),
      );
      const statuses = results.map((res) => res.status).sort();
      expect(statuses).toEqual([201, 201, 201, 409, 409, 409]);

      const [item] = await data(get('/warehouse/items?section=TABLEWARE'));
      expect(item.quantity).toBe('1');
    });

    it('tahrirlash qoldiqqa tegmaydi; o‘chirilgan mahsulot ro‘yxatdan yo‘qoladi', async () => {
      const oil = await createItem({
        section: 'FOOD',
        name: 'Yog‘',
        unit: 'LITER',
        initialQuantity: '2.5',
      });
      const renamed = await data(
        patch(`/warehouse/items/${oil.id}`, { name: 'Paxta yog‘i', minQuantity: '5' }).expect(200),
      );
      expect(renamed).toMatchObject({ name: 'Paxta yog‘i', quantity: '2.5', isLow: true });
      await patch(`/warehouse/items/${oil.id}`, { quantity: '100' }).expect(400);
      await patch(`/warehouse/items/${oil.id}`, { section: 'TABLEWARE' }).expect(400);
      // Kasrli qoldiq bilan donalab sanashga o'tib bo'lmaydi.
      await patch(`/warehouse/items/${oil.id}`, { unit: 'PIECE' }).expect(409);

      await del(`/warehouse/items/${oil.id}`).expect(204);
      expect(await data(get('/warehouse/items'))).toEqual([]);
      await move(oil.id, { type: 'IN', quantity: '1' }).expect(404);

      const audit = await get('/audit-logs?resource=warehouse_item').expect(200);
      expect(audit.body.data.map((row: { action: string }) => row.action)).toEqual([
        'warehouse.delete',
        'warehouse.update',
        'warehouse.create',
      ]);
    });
  });
});
