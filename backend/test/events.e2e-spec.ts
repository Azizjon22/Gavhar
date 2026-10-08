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
  let decorId: string;
  let cakeId: string;

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
    decorId = (
      await api('/extra-services', { name: 'Zal bezagi', price: '3000000', unit: 'PER_EVENT' })
    ).body.data.id;
    cakeId = (await api('/extra-services', { name: 'Tort', price: '5000', unit: 'PER_GUEST' })).body
      .data.id;
  });

  afterAll(async () => {
    await t.close();
  });

  const booking = (overrides: object = {}) => ({
    clientId,
    hallId,
    type: 'WEDDING',
    startAt: at(30, 13),
    endAt: at(30, 18),
    guestCount: 300,
    pricePerGuest: '230000',
    ...overrides,
  });
  const post = (path: string, body: object = {}, auth = admin.auth) =>
    t.http().post(`/api/v1${path}`).set(auth).send(body);
  const createEvent = async (overrides: object = {}) =>
    (await post('/events', booking(overrides)).expect(201)).body.data;
  const pay = (eventId: string, body: object) =>
    post(`/events/${eventId}/payments`, {
      kind: 'PAYMENT',
      method: 'CASH',
      currency: 'UZS',
      ...body,
    });

  describe('narx hisobi', () => {
    it('jami = mehmonlar × narx + xizmatlar − chegirma (zal uchun alohida haq yo‘q); narxlar bronda saqlanadi', async () => {
      const event = await createEvent({
        title: 'Anvar va Nodira to‘yi',
        discount: '4500000',
        services: [
          { extraServiceId: decorId, quantity: 1 },
          { extraServiceId: cakeId, quantity: 1 },
        ],
      });

      expect(event).toMatchObject({
        number: 1,
        status: 'REQUEST',
        guestsTotal: '69000000.00',
        extrasTotal: '4500000.00',
        discount: '4500000.00',
        totalAmount: '69000000.00',
        paidAmount: '0.00',
        debt: '69000000.00',
        requiredDeposit: '13800000.00',
        minDepositPercent: 20,
        client: { fullName: 'Karimov Anvar' },
        hall: { name: 'Oltin zal' },
      });
      expect(event).not.toHaveProperty('hallPrice');

      // Xizmat narxi keyin o'zgarsa ham mavjud bron summasi o'zgarmaydi.
      await t
        .http()
        .patch(`/api/v1/extra-services/${decorId}`)
        .set(admin.auth)
        .send({ price: '9000000' })
        .expect(200);
      const updated = await t
        .http()
        .patch(`/api/v1/events/${event.id}`)
        .set(admin.auth)
        .send({
          guestCount: 200,
          services: [
            { extraServiceId: decorId, quantity: 2 },
            { extraServiceId: cakeId, quantity: 1 },
          ],
        })
        .expect(200);

      // 200 × 230 000 + (2 × 3 000 000 + 200 × 5 000) − 4 500 000
      expect(updated.body.data).toMatchObject({
        extrasTotal: '7000000.00',
        totalAmount: '48500000.00',
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
      const cleared = await t
        .http()
        .patch(`/api/v1/events/${event.id}`)
        .set(admin.auth)
        .send({ secondDish: null })
        .expect(200);
      expect(cleared.body.data).toMatchObject({ firstDish: 'Osh', secondDish: null });
    });

    it.each([
      [{ endAt: at(30, 12) }, 'INVALID_TIME_RANGE'],
      [{ guestCount: 401 }, 'GUEST_COUNT_EXCEEDS_CAPACITY'],
      [{ discount: '70000000' }, 'DISCOUNT_EXCEEDS_TOTAL'],
      [
        { services: [{ extraServiceId: '7f3c5b9e-2c1a-4e55-9b7e-111111111111', quantity: 1 }] },
        'EXTRA_SERVICE_NOT_FOUND',
      ],
      [{ clientId: '7f3c5b9e-2c1a-4e55-9b7e-222222222222' }, 'CLIENT_NOT_FOUND'],
    ])('noto‘g‘ri bron rad etiladi: %j → %s', async (override, code) => {
      const res = await post('/events', booking(override)).expect(400);
      expect(res.body.error.code).toBe(code);
    });

    it("ta'mirdagi zalga bron ochilmaydi", async () => {
      await t
        .http()
        .patch(`/api/v1/halls/${hallId}`)
        .set(admin.auth)
        .send({ status: 'MAINTENANCE' })
        .expect(200);

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

      const other = await post('/halls', {
        name: 'Kumush zal',
        capacity: 300,
      }).expect(201);
      await createEvent({ hallId: other.body.data.id });
    });

    it('bir vaqtda kelgan so‘rovlardan faqat bittasi o‘tadi (baza darajasidagi kafolat)', async () => {
      const responses = await Promise.all(
        Array.from({ length: 6 }, () => post('/events', booking())),
      );

      expect(responses.map((res) => res.status).sort()).toEqual([201, 409, 409, 409, 409, 409]);
      expect(await t.prisma.event.count()).toBe(1);
    });

    it("bekor qilingan bron vaqtni bo'shatadi; band vaqtga ko'chirib bo'lmaydi", async () => {
      const first = await createEvent();
      const second = await createEvent({ startAt: at(31, 13), endAt: at(31, 18) });

      const move = await t
        .http()
        .patch(`/api/v1/events/${second.id}`)
        .set(admin.auth)
        .send({ startAt: at(30, 15), endAt: at(30, 20) })
        .expect(409);
      expect(move.body.error.code).toBe('HALL_BUSY');

      await post(`/events/${first.id}/cancel`, { reason: 'Mijoz rad etdi' }).expect(200);
      await t
        .http()
        .patch(`/api/v1/events/${second.id}`)
        .set(admin.auth)
        .send({ startAt: at(30, 15), endAt: at(30, 20) })
        .expect(200);
    });
  });

  describe('zaklad va holatlar', () => {
    it("zaklad to'lanmaguncha tasdiqlanmaydi; foiz sozlamadan olinadi", async () => {
      const event = await createEvent(); // jami 69 000 000, 20% = 13 800 000

      const noDeposit = await post(`/events/${event.id}/confirm`).expect(409);
      expect(noDeposit.body.error).toMatchObject({
        code: 'DEPOSIT_REQUIRED',
        details: { required: '13800000.00', paid: '0.00', percent: 20 },
      });

      await pay(event.id, { kind: 'DEPOSIT', amount: '13799999' }).expect(201);
      await post(`/events/${event.id}/confirm`).expect(409);
      await pay(event.id, { kind: 'DEPOSIT', amount: '1' }).expect(201);

      await t
        .http()
        .put('/api/v1/settings/booking')
        .set(admin.auth)
        .send({ minDepositPercent: 50 })
        .expect(200);
      const stricter = await post(`/events/${event.id}/confirm`).expect(409);
      expect(stricter.body.error.details.required).toBe('34500000.00');

      await t
        .http()
        .put('/api/v1/settings/booking')
        .set(admin.auth)
        .send({ minDepositPercent: 20 })
        .expect(200);
      const confirmed = await post(`/events/${event.id}/confirm`).expect(200);
      expect(confirmed.body.data).toMatchObject({ status: 'CONFIRMED', paidAmount: '13800000.00' });
    });

    it("to'liq oqim: so'rov → tasdiqlangan → o'tkazildi → yakunlandi", async () => {
      const future = await createEvent();
      await pay(future.id, { kind: 'DEPOSIT', amount: '20000000' }).expect(201);
      await post(`/events/${future.id}/confirm`).expect(200);
      const early = await post(`/events/${future.id}/hold`).expect(409);
      expect(early.body.error.code).toBe('EVENT_NOT_STARTED');

      // Kecha bo'lib o'tgan tadbir.
      const past = await createEvent({ startAt: at(-1, 13), endAt: at(-1, 18) });
      await pay(past.id, { kind: 'DEPOSIT', amount: '20000000' }).expect(201);
      await post(`/events/${past.id}/hold`).expect(409); // hali tasdiqlanmagan
      await post(`/events/${past.id}/confirm`).expect(200);
      await post(`/events/${past.id}/hold`).expect(200);

      const debt = await post(`/events/${past.id}/complete`).expect(409);
      expect(debt.body.error).toMatchObject({
        code: 'EVENT_HAS_DEBT',
        details: { debt: '49000000.00' },
      });

      // O'tkazilgan tadbirda mehmon soni aniqlashtirilishi mumkin, vaqti esa yo'q.
      await t
        .http()
        .patch(`/api/v1/events/${past.id}`)
        .set(admin.auth)
        .send({ guestCount: 280 })
        .expect(200);
      await t
        .http()
        .patch(`/api/v1/events/${past.id}`)
        .set(admin.auth)
        .send({ startAt: at(-1, 14) })
        .expect(409);

      await pay(past.id, { amount: '44400000', method: 'TRANSFER' }).expect(201);
      const done = await post(`/events/${past.id}/complete`).expect(200);
      expect(done.body.data).toMatchObject({ status: 'COMPLETED', debt: '0.00' });

      // Yopilgan bron o'zgarmaydi.
      await t
        .http()
        .patch(`/api/v1/events/${past.id}`)
        .set(admin.auth)
        .send({ guestCount: 10 })
        .expect(409);
      await pay(past.id, { amount: '1000' }).expect(409);
      await post(`/events/${past.id}/cancel`, { reason: 'Kech qoldi' }).expect(409);
    });

    it('bekor qilish sabab talab qiladi; bekor qilingan bronга faqat pul qaytariladi', async () => {
      const event = await createEvent();
      await pay(event.id, { kind: 'DEPOSIT', amount: '14000000' }).expect(201);

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
      await pay(event.id, { kind: 'REFUND', amount: '14000001' }).expect(409);
      const refunded = await pay(event.id, { kind: 'REFUND', amount: '14000000' }).expect(201);
      expect(refunded.body.data.paidAmount).toBe('0.00');
    });
  });

  describe("to'lovlar", () => {
    it("dollardagi to'lov kurs bo'yicha so'mga o'giriladi; kurs va valyuta saqlanadi", async () => {
      const event = await createEvent();

      await pay(event.id, { currency: 'USD', amount: '1000' }).expect(400);
      const res = await pay(event.id, {
        currency: 'USD',
        amount: '1000.50',
        exchangeRate: '12650.25',
        method: 'CARD',
      }).expect(201);

      expect(res.body.data.paidAmount).toBe('12656575.13');
      expect(res.body.data.payments[0]).toMatchObject({
        currency: 'USD',
        amount: '1000.50',
        exchangeRate: '12650.25',
        amountUzs: '12656575.13',
        method: 'CARD',
      });
    });

    it("qarzdan ortiq to'lov qabul qilinmaydi; bekor qilingan to'lov hisobdan chiqadi", async () => {
      const event = await createEvent(); // 69 000 000

      const over = await pay(event.id, { amount: '69000000.01' }).expect(409);
      expect(over.body.error).toMatchObject({
        code: 'PAYMENT_EXCEEDS_DEBT',
        details: { debt: '69000000.00' },
      });

      const first = await pay(event.id, { amount: '30000000' }).expect(201);
      await pay(event.id, { amount: '39000000' }).expect(201);
      await pay(event.id, { amount: '1' }).expect(409);

      const paymentId: string = first.body.data.payments[0].id;
      const voided = await t
        .http()
        .delete(`/api/v1/events/${event.id}/payments/${paymentId}`)
        .set(admin.auth)
        .expect(200);
      expect(voided.body.data).toMatchObject({ paidAmount: '39000000.00', debt: '30000000.00' });
      expect(voided.body.data.payments).toHaveLength(1);
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

    it("summa to'langandan pastga tushirilmaydi", async () => {
      const event = await createEvent();
      await pay(event.id, { amount: '60000000' }).expect(201);

      const res = await t
        .http()
        .patch(`/api/v1/events/${event.id}`)
        .set(admin.auth)
        .send({ guestCount: 100 })
        .expect(409);
      expect(res.body.error.code).toBe('TOTAL_BELOW_PAID');
    });
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
      expect((await list(`clientId=${clientId}&status=REQUEST`)).meta.total).toBe(2);
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
      const event = await createEvent({
        services: [{ extraServiceId: decorId, quantity: 1 }],
        note: 'Sahna oq gullar bilan',
      });
      const paidRes = await pay(event.id, {
        currency: 'USD',
        amount: '500',
        exchangeRate: '12650',
      }).expect(201);

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

      const paymentId: string = paidRes.body.data.payments[0].id;
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
      await t.http().delete(`/api/v1/events/${event.id}`).set(admin.auth).expect(409);
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

      // Menejer pulni ko'rmaydi — narx menyu paketidan olinadi.
      const pkg = await post('/menu/packages', {
        name: 'Premium',
        pricePerGuest: '230000',
        sections: [],
      }).expect(201);
      await post('/events', booking(), manager.auth).expect(400);
      const created = await post(
        '/events',
        booking({ menuPackageId: pkg.body.data.id }),
        manager.auth,
      ).expect(201);
      const eventId: string = created.body.data.id;
      expect(created.body.data).not.toHaveProperty('totalAmount');

      const denied = await pay(eventId, { amount: '14000000' }).set(manager.auth).expect(403);
      expect(denied.body.error.details.missingPermissions).toEqual(['finance:create']);
      await pay(eventId, { kind: 'DEPOSIT', amount: '14000000' }).set(cashier.auth).expect(201);

      await post(`/events/${eventId}/confirm`, {}, cashier.auth).expect(403);
      await post(
        '/events',
        booking({ startAt: at(60, 13), endAt: at(60, 18) }),
        cashier.auth,
      ).expect(403);
      await post(`/events/${eventId}/confirm`, {}, manager.auth).expect(200);
      // Sozlamani faqat ruxsati bor o'zgartiradi.
      await t
        .http()
        .put('/api/v1/settings/booking')
        .set(manager.auth)
        .send({ minDepositPercent: 0 })
        .expect(403);

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
