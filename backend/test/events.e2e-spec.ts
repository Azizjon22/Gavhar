import { ActiveSuperAdmin, Authenticated, TestApp } from './utils/test-app';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Bugundan `days` kun keyin, soat `hour` (UTC) — testlar bir-biriga to'qnashmasligi uchun. */
const at = (days: number, hour: number): string => {
  const base = new Date(Date.now() + days * DAY);
  base.setUTCHours(hour, 0, 0, 0);
  return base.toISOString();
};

describe('Bronlar (e2e)', () => {
  let t: TestApp;
  let admin: ActiveSuperAdmin;
  let hallId: string;
  let clientId: string;
  /** 300 mehmonlik paket — 69 000 000 so'm; arzonrog'i — 40 000 000. */
  let packageId: string;
  let cheaperId: string;

  beforeAll(async () => {
    t = await TestApp.create();
  });

  beforeEach(async () => {
    await t.reset();
    admin = await t.activateSuperAdmin();
    await t.clearRateLimits();

    const api = (path: string, body: object) =>
      t.http().post(`/api/v1${path}`).set(admin.auth).send(body).expect(201);
    hallId = (await api('/halls', { name: 'Oltin zal', capacity: 400 })).body.data.id;
    clientId = (await api('/clients', { fullName: 'Karimov Anvar', phone: '+998901234567' })).body
      .data.id;
    const menuPackage = (name: string, price: string, packageType: string) =>
      api('/menu/packages', { name, price, guestCount: 300, packageType, sections: [] });
    packageId = (await menuPackage('To‘liq paket', '69000000', 'FULL')).body.data.id;
    cheaperId = (await menuPackage('Taomlar', '40000000', 'FOOD_ONLY')).body.data.id;
  });

  afterAll(async () => {
    await t.close();
  });

  const booking = (overrides: object = {}) => ({
    clientId,
    hallId,
    menuPackageId: packageId,
    type: 'WEDDING',
    startAt: at(30, 13),
    endAt: at(30, 18),
    guestCount: 300,
    ...overrides,
  });
  const post = (path: string, body: object = {}, auth = admin.auth) =>
    t.http().post(`/api/v1${path}`).set(auth).send(body);
  const patch = (path: string, body: object) =>
    t.http().patch(`/api/v1${path}`).set(admin.auth).send(body);
  const createEvent = async (overrides: object = {}) =>
    (await post('/events', booking(overrides)).expect(201)).body.data;
  const pay = (eventId: string, body: object) =>
    post(`/events/${eventId}/payments`, { kind: 'PAYMENT', method: 'CASH', ...body });
  /** Kechagi to'y: o'tgan sanaga bron ochilmaydi, shuning uchun mavjudi ko'chiriladi. */
  const pastEvent = async () => {
    const event = await createEvent({ startAt: at(20, 13), endAt: at(20, 18) });
    await patch(`/events/${event.id}`, { startAt: at(-1, 13), endAt: at(-1, 18) }).expect(200);
    return event as { id: string };
  };

  describe('narx — menyu paketidan', () => {
    it('to‘y narxi paketdan olinadi; paket narxi yoki mehmonlar soni o‘zgarsa ham saqlanadi', async () => {
      const event = await createEvent({ title: 'Anvar va Nodira to‘yi' });
      expect(event).toMatchObject({
        number: 1,
        status: 'REQUEST',
        totalAmount: '69000000.00',
        paidAmount: '0.00',
        debt: '69000000.00',
        receivedAmount: '0.00',
        refundedAmount: '0.00',
        menuPackage: { id: packageId, name: 'To‘liq paket' },
        client: { fullName: 'Karimov Anvar' },
        hall: { name: 'Oltin zal' },
      });
      for (const removed of ['pricePerGuest', 'discount', 'services', 'requiredDeposit']) {
        expect(event).not.toHaveProperty(removed);
      }

      await patch(`/menu/packages/${packageId}`, { price: '90000000' }).expect(200);
      const fewer = await patch(`/events/${event.id}`, { guestCount: 200 }).expect(200);
      expect(fewer.body.data).toMatchObject({ guestCount: 200, totalAmount: '69000000.00' });

      // Faqat boshqa paketga o'tilganda narx o'sha paketdan qayta olinadi.
      const switched = await patch(`/events/${event.id}`, { menuPackageId: cheaperId }).expect(200);
      expect(switched.body.data).toMatchObject({
        totalAmount: '40000000.00',
        menuPackage: { id: cheaperId, name: 'Taomlar' },
      });
    });

    it('stol turi va 1-/2-ovqat: ovqatni faqat SUPER_ADMIN belgilaydi', async () => {
      const event = await createEvent({
        tableCapacity: 12,
        firstDish: ' Osh ',
        secondDish: 'Qozon kabob',
      });
      expect(event).toMatchObject({
        tableCapacity: 12,
        firstDish: 'Osh',
        secondDish: 'Qozon kabob',
      });
      await post(
        '/events',
        booking({ tableCapacity: 11, startAt: at(40, 13), endAt: at(40, 18) }),
      ).expect(400);

      const manager = await t.createActiveUser(admin, {
        email: 'admin2@gavhar.test',
        fullName: 'Ikkinchi Admin',
        roleId: await t.roleId('ADMIN'),
      });
      const denied = await manager.agent
        .patch(`/api/v1/events/${event.id}`)
        .set(manager.auth)
        .send({ firstDish: 'Sho‘rva' })
        .expect(403);
      expect(denied.body.error.code).toBe('DISHES_SUPER_ADMIN_ONLY');
      // Admin boshqa maydonlarni o'zgartira oladi — tanlangan ovqatlar joyida qoladi.
      const edited = await manager.agent
        .patch(`/api/v1/events/${event.id}`)
        .set(manager.auth)
        .send({ tableCapacity: 10 })
        .expect(200);
      expect(edited.body.data).toMatchObject({ tableCapacity: 10, firstDish: 'Osh' });

      // Bo'sh qiymat tanlovni olib tashlaydi.
      const cleared = await patch(`/events/${event.id}`, { secondDish: null }).expect(200);
      expect(cleared.body.data).toMatchObject({ firstDish: 'Osh', secondDish: null });
    });

    it.each([
      [{ endAt: at(30, 12) }, 'INVALID_TIME_RANGE'],
      [{ guestCount: 401 }, 'GUEST_COUNT_EXCEEDS_CAPACITY'],
      [{ clientId: '7f3c5b9e-2c1a-4e55-9b7e-222222222222' }, 'CLIENT_NOT_FOUND'],
      [{ menuPackageId: '7f3c5b9e-2c1a-4e55-9b7e-333333333333' }, 'MENU_PACKAGE_NOT_FOUND'],
      [{ menuPackageId: undefined }, 'VALIDATION_ERROR'],
      [{ startAt: at(-2, 13), endAt: at(-2, 18) }, 'EVENT_DATE_PAST'],
    ])('noto‘g‘ri bron rad etiladi: %j → %s', async (override, code) => {
      const res = await post('/events', booking(override)).expect(400);
      expect(res.body.error.code).toBe(code);
    });

    it("bugungi kunga bron ochiladi; faol bo'lmagan paket tanlanmaydi", async () => {
      await createEvent({ startAt: at(0, 21), endAt: at(0, 23) });
      await patch(`/menu/packages/${cheaperId}`, { isActive: false }).expect(200);
      const inactive = await post(
        '/events',
        booking({ menuPackageId: cheaperId, startAt: at(41, 13), endAt: at(41, 18) }),
      ).expect(400);
      expect(inactive.body.error.code).toBe('MENU_PACKAGE_NOT_FOUND');
    });

    it("ta'mirdagi zalga bron ochilmaydi", async () => {
      await patch(`/halls/${hallId}`, { status: 'MAINTENANCE' }).expect(200);
      const res = await post('/events', booking()).expect(409);
      expect(res.body.error.code).toBe('HALL_UNAVAILABLE');
    });
  });

  describe('bir zalda bir vaqtda ikki bron bo‘lmaydi', () => {
    it('ustma-ust tushgan vaqt rad etiladi; ketma-ket va boshqa zal — mumkin', async () => {
      const first = await createEvent();

      const overlap = await post(
        '/events',
        booking({ startAt: at(30, 17), endAt: at(30, 22) }),
      ).expect(409);
      expect(overlap.body.error).toMatchObject({
        code: 'HALL_BUSY',
        details: { number: first.number, clientName: 'Karimov Anvar' },
      });

      // Birinchisi tugagan zahoti boshlanadigan bron (nahor oshi + kechki to'y).
      await createEvent({ type: 'OSH', startAt: at(30, 2), endAt: at(30, 6) });
      await createEvent({ startAt: at(30, 18), endAt: at(30, 23) });

      const other = await post('/halls', { name: 'Kumush zal', capacity: 300 }).expect(201);
      await createEvent({ hallId: other.body.data.id });
    });

    it('bir vaqtda kelgan so‘rovlardan faqat bittasi o‘tadi (baza darajasidagi kafolat)', async () => {
      const responses = await Promise.all(
        Array.from({ length: 6 }, () => post('/events', booking())),
      );

      expect(responses.map((res) => res.status).sort()).toEqual([201, 409, 409, 409, 409, 409]);
      expect(await t.prisma.event.count()).toBe(1);
    });

    it("bekor qilingan bron vaqtni bo'shatadi; qayta ochilganda vaqt yana tekshiriladi", async () => {
      const first = await createEvent();
      const second = await createEvent({ startAt: at(31, 13), endAt: at(31, 18) });

      const move = await patch(`/events/${second.id}`, {
        startAt: at(30, 15),
        endAt: at(30, 20),
      }).expect(409);
      expect(move.body.error.code).toBe('HALL_BUSY');

      await post(`/events/${first.id}/cancel`, { reason: 'Mijoz rad etdi' }).expect(200);
      await patch(`/events/${second.id}`, { startAt: at(30, 15), endAt: at(30, 20) }).expect(200);

      // Vaqtini boshqasi egallagan bekor qilingan bron qayta ochilmaydi.
      const busy = await post(`/events/${first.id}/reopen`).expect(409);
      expect(busy.body.error.code).toBe('HALL_BUSY');
    });
  });

  describe('holatlar', () => {
    it("to'liq to'langan bron o'zi tasdiqlanadi; qo'lda ham tasdiqlash mumkin", async () => {
      const paid = await createEvent();
      await pay(paid.id, { amount: '30000000' }).expect(201);
      const settled = await pay(paid.id, { amount: '39000000', method: 'TRANSFER' }).expect(201);
      expect(settled.body.data).toMatchObject({ status: 'CONFIRMED', debt: '0.00' });

      const again = await pay(paid.id, { amount: '1' }).expect(409);
      expect(again.body.error.code).toBe('EVENT_FULLY_PAID');

      const manual = await createEvent({ startAt: at(31, 13), endAt: at(31, 18) });
      const confirmed = await post(`/events/${manual.id}/confirm`).expect(200);
      expect(confirmed.body.data).toMatchObject({ status: 'CONFIRMED', paidAmount: '0.00' });
      await post(`/events/${manual.id}/confirm`).expect(409);

      const audit = await t
        .http()
        .get(`/api/v1/audit-logs?resource=event&resourceId=${paid.id}`)
        .set(admin.auth)
        .expect(200);
      expect(audit.body.data.map((log: { action: string }) => log.action)).toContain(
        'event.auto_confirm',
      );
    });

    it("to'y kuni kelmaguncha yakunlanmaydi; qarzi bor to'y yakunlanadi va qarz undiriladi", async () => {
      const future = await createEvent();
      const early = await post(`/events/${future.id}/complete`).expect(409);
      expect(early.body.error.code).toBe('EVENT_NOT_STARTED');

      const past = await pastEvent();
      await pay(past.id, { amount: '20000000' }).expect(201);
      const done = await post(`/events/${past.id}/complete`).expect(200);
      expect(done.body.data).toMatchObject({ status: 'COMPLETED', debt: '49000000.00' });

      // Yakunlangan to'y tahrirlanmaydi va bekor qilinmaydi, lekin qarz to'lanaveradi.
      const locked = await patch(`/events/${past.id}`, { guestCount: 10 }).expect(409);
      expect(locked.body.error.code).toBe('EVENT_NOT_EDITABLE');
      await post(`/events/${past.id}/cancel`, { reason: 'Kech qoldi' }).expect(409);
      const collected = await pay(past.id, { amount: '49000000' }).expect(201);
      expect(collected.body.data).toMatchObject({ status: 'COMPLETED', debt: '0.00' });

      // Xato bilan yakunlangani qayta ochiladi.
      const reopened = await post(`/events/${past.id}/reopen`).expect(200);
      expect(reopened.body.data.status).toBe('CONFIRMED');
    });

    it('bekor qilish sabab talab qiladi; bekor qilingan to‘yga faqat pul qaytariladi', async () => {
      const event = await createEvent();
      await pay(event.id, { amount: '14000000' }).expect(201);

      await post(`/events/${event.id}/cancel`, { reason: '' }).expect(400);
      const cancelled = await post(`/events/${event.id}/cancel`, {
        reason: 'Sana o‘zgardi',
      }).expect(200);
      expect(cancelled.body.data).toMatchObject({
        status: 'CANCELLED',
        cancelReason: 'Sana o‘zgardi',
      });

      const more = await pay(event.id, { amount: '1000' }).expect(409);
      expect(more.body.error.code).toBe('EVENT_CANCELLED');
      const tooMuch = await pay(event.id, { kind: 'REFUND', amount: '14000001' }).expect(409);
      expect(tooMuch.body.error.code).toBe('REFUND_EXCEEDS_PAID');
      const refunded = await pay(event.id, { kind: 'REFUND', amount: '4000000' }).expect(201);
      expect(refunded.body.data).toMatchObject({
        paidAmount: '10000000.00',
        receivedAmount: '14000000.00',
        refundedAmount: '4000000.00',
      });

      // Qayta ochilgan bron — "kutilmoqda", sababi tozalanadi.
      const reopened = await post(`/events/${event.id}/reopen`).expect(200);
      expect(reopened.body.data).toMatchObject({ status: 'REQUEST', cancelReason: null });
    });

    it("pulli, xarajatli yoki tasdiqlangan bron o'chirilmaydi — bekor qilinadi", async () => {
      const clean = await createEvent();
      const withPayment = await createEvent({ startAt: at(31, 13), endAt: at(31, 18) });
      const confirmed = await createEvent({ startAt: at(32, 13), endAt: at(32, 18) });

      const payment = await pay(withPayment.id, { amount: '1000000' }).expect(201);
      // Bekor qilingan to'lov ham tarix — bron baribir o'chirilmaydi.
      await t
        .http()
        .delete(`/api/v1/events/${withPayment.id}/payments/${payment.body.data.payments[0].id}`)
        .set(admin.auth)
        .expect(200);
      const money = await t
        .http()
        .delete(`/api/v1/events/${withPayment.id}`)
        .set(admin.auth)
        .expect(409);
      expect(money.body.error.code).toBe('EVENT_HAS_MONEY');

      await post(`/events/${confirmed.id}/confirm`).expect(200);
      const locked = await t
        .http()
        .delete(`/api/v1/events/${confirmed.id}`)
        .set(admin.auth)
        .expect(409);
      expect(locked.body.error.code).toBe('EVENT_DELETE_FORBIDDEN');

      await t.http().delete(`/api/v1/events/${clean.id}`).set(admin.auth).expect(204);
    });
  });

  describe("to'lovlar", () => {
    it("qarzdan ortiq to'lov qabul qilinmaydi; bekor qilingan to'lov hisobdan chiqadi", async () => {
      const event = await createEvent(); // 69 000 000

      const over = await pay(event.id, { amount: '69000000.01' }).expect(409);
      expect(over.body.error).toMatchObject({
        code: 'PAYMENT_EXCEEDS_DEBT',
        details: { debt: '69000000.00' },
      });

      const first = await pay(event.id, { amount: '30000000' }).expect(201);
      await pay(event.id, { amount: '39000000', method: 'CARD' }).expect(201);
      await pay(event.id, { amount: '1' }).expect(409);

      const paymentId: string = first.body.data.payments[0].id;
      const voided = await t
        .http()
        .delete(`/api/v1/events/${event.id}/payments/${paymentId}`)
        .set(admin.auth)
        .expect(200);
      expect(voided.body.data).toMatchObject({ paidAmount: '39000000.00', debt: '30000000.00' });
      expect(voided.body.data.payments).toEqual([
        expect.objectContaining({ kind: 'PAYMENT', method: 'CARD', amount: '39000000.00' }),
      ]);
      // Yozuv bazadan o'chmaydi — tarix saqlanadi.
      expect(await t.prisma.payment.count()).toBe(2);
    });

    it("parallel to'lovlar qarzdan oshib ketmaydi", async () => {
      const event = await createEvent(); // 69 000 000

      const responses = await Promise.all(
        Array.from({ length: 5 }, () => pay(event.id, { amount: '20000000' })),
      );

      expect(responses.filter((res) => res.status === 201)).toHaveLength(3);
      const fresh = await t.http().get(`/api/v1/events/${event.id}`).set(admin.auth).expect(200);
      expect(fresh.body.data).toMatchObject({ paidAmount: '60000000.00', debt: '9000000.00' });
    });

    it("to'langandan arzon paketga o'tib bo'lmaydi; mehmonlar sonini o'zgartirsa bo'ladi", async () => {
      const event = await createEvent();
      await pay(event.id, { amount: '60000000' }).expect(201);

      const res = await patch(`/events/${event.id}`, { menuPackageId: cheaperId }).expect(409);
      expect(res.body.error).toMatchObject({
        code: 'TOTAL_BELOW_PAID',
        details: { paidAmount: '60000000.00', totalAmount: '40000000.00' },
      });
      await patch(`/events/${event.id}`, { guestCount: 100 }).expect(200);
    });

    it.each([[{ currency: 'USD' }], [{ kind: 'DEPOSIT' }]])(
      'olib tashlangan to‘lov turlari qabul qilinmaydi: %j',
      async (override) => {
        const event = await createEvent();
        await pay(event.id, { amount: '1000', ...override }).expect(400);
      },
    );
  });

  describe("ro'yxat, kalendar va hujjatlar", () => {
    it('filtr, qidiruv va faqat qarzdorlar', async () => {
      const paid = await createEvent({ title: 'Yubiley kechasi', type: 'ANNIVERSARY' });
      await pay(paid.id, { amount: '69000000' }).expect(201);
      await createEvent({ startAt: at(40, 13), endAt: at(40, 18) });
      const list = async (query: string) =>
        (await t.http().get(`/api/v1/events?${query}`).set(admin.auth).expect(200)).body;

      expect((await list('')).meta.total).toBe(2);
      expect((await list('debtOnly=true')).data.map((e: { number: number }) => e.number)).toEqual([
        2,
      ]);
      expect((await list('search=yubiley')).data).toHaveLength(1);
      expect((await list('search=karimov')).data).toHaveLength(2);
      expect((await list('search=2')).data.map((e: { number: number }) => e.number)).toEqual([2]);
      expect((await list(`from=${at(35, 0)}`)).data).toHaveLength(1);
      // To'liq to'langani o'zi tasdiqlangan.
      expect((await list(`clientId=${clientId}&status=REQUEST`)).meta.total).toBe(1);
      expect((await list(`clientId=${clientId}&status=CONFIRMED`)).meta.total).toBe(1);
    });

    it('kalendar oraliqqa tushgan bronlarni qaytaradi', async () => {
      await createEvent();
      await createEvent({ startAt: at(45, 13), endAt: at(45, 18) });

      const month = await t
        .http()
        .get(`/api/v1/events/calendar?from=${at(29, 0)}&to=${at(32, 0)}`)
        .set(admin.auth)
        .expect(200);
      expect(month.body.data).toHaveLength(1);
      await t
        .http()
        .get(`/api/v1/events/calendar?from=${at(0, 0)}&to=${at(200, 0)}`)
        .set(admin.auth)
        .expect(400);
    });

    it('shartnoma va kvitansiya PDF ko‘rinishida beriladi', async () => {
      const event = await createEvent({ note: 'Sahna oq gullar bilan' });
      await pay(event.id, { amount: '10000000' }).expect(201);
      const paidRes = await pay(event.id, { kind: 'REFUND', amount: '2500000' }).expect(201);

      const contract = await t
        .http()
        .get(`/api/v1/events/${event.id}/contract`)
        .set(admin.auth)
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(contract.headers['content-type']).toBe('application/pdf');
      expect(contract.headers['content-disposition']).toContain('shartnoma-1.pdf');
      expect((contract.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      expect((contract.body as Buffer).length).toBeGreaterThan(5000);

      const paymentId: string = paidRes.body.data.payments[1].id;
      const receipt = await t
        .http()
        .get(`/api/v1/events/${event.id}/payments/${paymentId}/receipt`)
        .set(admin.auth)
        .expect(200);
      expect(receipt.headers['content-type']).toBe('application/pdf');
    });

    it("mijoz kartasida bronlar soni va qarzdorlik ko'rinadi; faol bronli mijoz va zal o'chirilmaydi", async () => {
      const event = await createEvent();
      await pay(event.id, { amount: '19000000' }).expect(201);
      const cancelled = await createEvent({ startAt: at(50, 13), endAt: at(50, 18) });
      await post(`/events/${cancelled.id}/cancel`, { reason: 'Bekor' }).expect(200);

      const client = await t.http().get(`/api/v1/clients/${clientId}`).set(admin.auth).expect(200);
      expect(client.body.data.stats).toEqual({
        eventsCount: 1,
        totalAmount: '69000000.00',
        paidAmount: '19000000.00',
        debt: '50000000.00',
      });

      const delClient = await t
        .http()
        .delete(`/api/v1/clients/${clientId}`)
        .set(admin.auth)
        .expect(409);
      expect(delClient.body.error.code).toBe('CLIENT_HAS_EVENTS');
      const delHall = await t.http().delete(`/api/v1/halls/${hallId}`).set(admin.auth).expect(409);
      expect(delHall.body.error.code).toBe('HALL_HAS_EVENTS');
      // To'lovi bor bron o'chirilmaydi, to'lovsiz bekor qilingani — o'chiriladi.
      const del = await t.http().delete(`/api/v1/events/${event.id}`).set(admin.auth).expect(409);
      expect(del.body.error.code).toBe('EVENT_HAS_MONEY');
      await t.http().delete(`/api/v1/events/${cancelled.id}`).set(admin.auth).expect(204);
    });
  });

  describe('ruxsatlar', () => {
    const userWith = async (name: string, permissions: string[]): Promise<Authenticated> => {
      const role = await post('/roles', { name, permissions }).expect(201);
      const user = await t.createActiveUser(admin, {
        email: `${name.toLowerCase()}@gavhar.test`,
        fullName: `${name} Xodim`,
        roleId: role.body.data.id,
      });
      await t.clearRateLimits();
      return user;
    };

    it("menejer bron ochadi, lekin to'lov qabul qila olmaydi; kassir — aksincha", async () => {
      const manager = await userWith('Menejer', ['events:read', 'events:create', 'events:update']);
      const cashier = await userWith('Kassir', ['events:read', 'finance:create']);

      // Menejer pulni ko'rmaydi: narx baribir menyu paketidan olinadi.
      const created = await post('/events', booking(), manager.auth).expect(201);
      const eventId: string = created.body.data.id;
      expect(created.body.data).not.toHaveProperty('totalAmount');

      const denied = await pay(eventId, { amount: '14000000' }).set(manager.auth).expect(403);
      expect(denied.body.error.details.missingPermissions).toEqual(['finance:create']);
      await pay(eventId, { amount: '14000000' }).set(cashier.auth).expect(201);

      await post(`/events/${eventId}/confirm`, {}, cashier.auth).expect(403);
      await post(
        '/events',
        booking({ startAt: at(60, 13), endAt: at(60, 18) }),
        cashier.auth,
      ).expect(403);
      await post(`/events/${eventId}/confirm`, {}, manager.auth).expect(200);

      const audit = await t
        .http()
        .get(`/api/v1/audit-logs?resource=event&resourceId=${eventId}`)
        .set(admin.auth)
        .expect(200);
      expect(audit.body.data.map((log: { action: string }) => log.action)).toEqual(
        expect.arrayContaining(['event.create', 'payment.create', 'event.confirm']),
      );
    });
  });
});
