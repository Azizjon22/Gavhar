import sharp from 'sharp';
import { Response } from 'supertest';
import { ActiveSuperAdmin, Authenticated, TestApp } from './utils/test-app';

const DAY = 86_400_000;
const at = (days: number, hour: number): string => {
  const base = new Date(Date.now() + days * DAY);
  base.setUTCHours(hour, 0, 0, 0);
  return base.toISOString();
};

describe('Ishchilar, zavzal va pulni yashirish (e2e)', () => {
  let t: TestApp;
  let admin: ActiveSuperAdmin;
  let zavzal: Authenticated & { id: string };
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
    zavzal = await t.createActiveUser(admin, {
      email: 'zavzal@gavhar.test',
      fullName: 'Zavzal Aka',
      roleId: await t.roleId('ZAVZAL'),
    });
    manager = await t.createActiveUser(admin, {
      email: 'admin2@gavhar.test',
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
          name: 'Premium',
          pricePerGuest: '200000',
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
  const booking = (overrides: object = {}) => ({
    clientId,
    hallId,
    type: 'WEDDING',
    title: 'Anvar va Nodira to‘yi',
    startAt: at(20, 13),
    endAt: at(20, 18),
    guestCount: 300,
    ...overrides,
  });
  const WAITER = {
    fullName: 'Sardor Ofitsiant',
    phone: '+998 (90) 111-22-33',
    position: 'WAITER_MALE',
  };

  it('tizim rollari: Zavzal to‘y va ishchilarni yuritadi, Admin va Zavzalda moliya yo‘q', async () => {
    const roles = await data(as(admin).get('/roles').expect(200));
    const role = (key: string) =>
      roles.find((item: { key: string }) => item.key === key) as { permissions: string[] };
    expect([...role('ZAVZAL').permissions].sort()).toEqual([
      'dashboard:read',
      'events:read',
      'halls:read',
      'staff:create',
      'staff:read',
      'staff:update',
    ]);
    expect(role('ADMIN').permissions.filter((key) => key.startsWith('finance:'))).toEqual([]);
  });

  it('ishchi: qo‘shiladi, tahrirlanadi, rasm yuklanadi, telefon takrorlanmaydi', async () => {
    const worker = await data(as(zavzal).post('/workers', WAITER).expect(201));
    expect(worker).toMatchObject({
      fullName: 'Sardor Ofitsiant',
      phone: '+998901112233',
      position: 'WAITER_MALE',
      isActive: true,
      photo: null,
    });

    const twice = await as(zavzal)
      .post('/workers', { ...WAITER, fullName: 'Boshqa' })
      .expect(409);
    expect(twice.body.error).toMatchObject({
      code: 'WORKER_PHONE_TAKEN',
      details: { name: 'Sardor Ofitsiant' },
    });
    await as(zavzal)
      .post('/workers', { ...WAITER, phone: '12345' })
      .expect(400);
    await as(zavzal)
      .post('/workers', { ...WAITER, phone: '+998901112244', position: 'DJ' })
      .expect(400);

    const png = await sharp({
      create: { width: 600, height: 600, channels: 3, background: '#0F4C3A' },
    })
      .png()
      .toBuffer();
    const withPhoto = (
      await zavzal.agent
        .post(`/api/v1/workers/${worker.id}/photo`)
        .set(zavzal.auth)
        .attach('file', png, { filename: 'sardor.png', contentType: 'image/png' })
        .expect(201)
    ).body.data;
    expect((await fetch(withPhoto.photo.thumbUrl)).status).toBe(200);

    const edited = await data(
      as(zavzal)
        .patch(`/workers/${worker.id}`, { position: 'OTHER', note: ' Qorovul ' })
        .expect(200),
    );
    expect(edited).toMatchObject({ position: 'OTHER', note: 'Qorovul' });

    await data(
      as(admin).post('/workers', {
        fullName: 'Dilnoza Oshpaz',
        phone: '+998935554433',
        position: 'CHEF',
      }),
    );
    const chefs = await data(as(zavzal).get('/workers?position=CHEF'));
    expect(chefs.map((item: { fullName: string }) => item.fullName)).toEqual(['Dilnoza Oshpaz']);

    // Zavzal o'chira olmaydi; o'chirilgan ishchining telefoni bo'shaydi.
    await as(zavzal).del(`/workers/${worker.id}`).expect(403);
    await as(admin).del(`/workers/${worker.id}`).expect(204);
    expect(await data(as(zavzal).get('/workers'))).toHaveLength(1);
    await as(zavzal).post('/workers', WAITER).expect(201);
  });

  it('to‘yga biriktirish: faqat faol ishchi, ikki marta emas; ro‘yxatda oldindagi to‘ylar soni', async () => {
    const event = await data(
      as(admin)
        .post('/events', booking({ pricePerGuest: '200000' }))
        .expect(201),
    );
    const waiter = await data(as(zavzal).post('/workers', WAITER));
    const chef = await data(
      as(zavzal).post('/workers', {
        fullName: 'Dilnoza Oshpaz',
        phone: '+998935554433',
        position: 'CHEF',
      }),
    );

    const first = await data(
      as(zavzal)
        .post(`/events/${event.id}/workers`, {
          workerId: waiter.id,
          roleAtEvent: ' Bosh ofitsiant ',
        })
        .expect(201),
    );
    expect(first).toMatchObject([
      {
        roleAtEvent: 'Bosh ofitsiant',
        assignedByName: 'Zavzal Aka',
        worker: { fullName: 'Sardor Ofitsiant' },
      },
    ]);
    const again = await as(zavzal)
      .post(`/events/${event.id}/workers`, { workerId: waiter.id })
      .expect(409);
    expect(again.body.error.code).toBe('WORKER_ALREADY_ASSIGNED');

    await as(zavzal).patch(`/workers/${chef.id}`, { isActive: false }).expect(200);
    const inactive = await as(zavzal)
      .post(`/events/${event.id}/workers`, { workerId: chef.id })
      .expect(409);
    expect(inactive.body.error.code).toBe('WORKER_INACTIVE');
    await as(zavzal).patch(`/workers/${chef.id}`, { isActive: true }).expect(200);
    await as(zavzal).post(`/events/${event.id}/workers`, { workerId: chef.id }).expect(201);

    const workers = await data(as(zavzal).get('/workers'));
    expect(
      workers.map((item: { fullName: string; upcomingEvents: number }) => [
        item.fullName,
        item.upcomingEvents,
      ]),
    ).toEqual([
      ['Dilnoza Oshpaz', 1],
      ['Sardor Ofitsiant', 1],
    ]);

    const left = await data(as(zavzal).del(`/events/${event.id}/workers/${waiter.id}`).expect(200));
    expect(left).toHaveLength(1);
    await as(zavzal).del(`/events/${event.id}/workers/${waiter.id}`).expect(404);

    const audit = await as(admin)
      .get(`/audit-logs?resource=event&resourceId=${event.id}`)
      .expect(200);
    expect(audit.body.data.map((row: { action: string }) => row.action)).toEqual(
      expect.arrayContaining(['worker.assign', 'worker.unassign']),
    );
  });

  it('pul faqat super admin va moliya ruxsati bor rolga ko‘rinadi', async () => {
    const event = await data(
      as(admin)
        .post('/events', booking({ pricePerGuest: '200000' }))
        .expect(201),
    );
    await as(admin)
      .post(`/events/${event.id}/payments`, {
        kind: 'DEPOSIT',
        method: 'CASH',
        currency: 'UZS',
        amount: '12000000',
      })
      .expect(201);

    expect(await data(as(admin).get(`/events/${event.id}`))).toMatchObject({
      totalAmount: '60000000.00',
      paidAmount: '12000000.00',
    });

    for (const viewer of [zavzal, manager]) {
      const detail = await data(as(viewer).get(`/events/${event.id}`).expect(200));
      expect(detail).toMatchObject({ number: 1, guestCount: 300, hall: { name: 'Oltin zal' } });
      const list = await as(viewer).get('/events').expect(200);
      const calendar = await as(viewer)
        .get(`/events/calendar?from=${at(0, 0)}&to=${at(40, 0)}`)
        .expect(200);
      for (const body of [detail, list.body.data, calendar.body.data]) {
        expect(JSON.stringify(body)).not.toMatch(
          /totalAmount|paidAmount|pricePerGuest|debt|payments|requiredDeposit|discount|000\.00/,
        );
      }
      await as(viewer).get(`/events/${event.id}/contract`).expect(403);
      await as(viewer).get(`/finance/events/${event.id}`).expect(403);
      await as(viewer)
        .post(`/events/${event.id}/payments`, {
          kind: 'PAYMENT',
          method: 'CASH',
          currency: 'UZS',
          amount: '1000',
        })
        .expect(403);
    }
    // Zavzal bron ocha yoki o'zgartira olmaydi.
    await as(zavzal).post('/events', booking()).expect(403);
    await as(zavzal).patch(`/events/${event.id}`, { guestCount: 100 }).expect(403);
  });

  it('dashboard: bugungi va ertangi to‘ylar, hafta, ombor va bozorlik; pul faqat ruxsati borga', async () => {
    const local = (days: number) => {
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(
        new Date(Date.now() + days * DAY),
      );
      const start = new Date(`${day}T12:00:00+05:00`);
      return {
        startAt: start.toISOString(),
        endAt: new Date(start.getTime() + 3_600_000).toISOString(),
      };
    };
    const today = await data(
      as(admin)
        .post(
          '/events',
          booking({ ...local(0), pricePerGuest: '200000', tableCapacity: 12, firstDish: 'Osh' }),
        )
        .expect(201),
    );
    await data(
      as(admin)
        .post('/events', booking({ ...local(1), pricePerGuest: '200000', guestCount: 100 }))
        .expect(201),
    );
    await data(
      as(admin)
        .post('/events', booking({ ...local(4), pricePerGuest: '200000', guestCount: 50 }))
        .expect(201),
    );
    const cancelled = await data(
      as(admin)
        .post('/events', booking({ ...local(2), pricePerGuest: '200000' }))
        .expect(201),
    );
    await as(admin).post(`/events/${cancelled.id}/cancel`, { reason: 'Bekor' }).expect(200);

    await as(admin)
      .post(`/events/${today.id}/payments`, {
        kind: 'DEPOSIT',
        method: 'CASH',
        currency: 'UZS',
        amount: '15000000',
      })
      .expect(201);
    const waiter = await data(as(zavzal).post('/workers', WAITER));
    await as(zavzal)
      .post(`/events/${today.id}/workers`, { workerId: waiter.id, roleAtEvent: 'Bosh ofitsiant' })
      .expect(201);
    await as(admin)
      .post(`/shopping/events/${today.id}/lists`, {
        items: [{ name: 'Guruch', unit: 'KG', quantity: '40' }],
      })
      .expect(201);
    await as(admin)
      .post('/warehouse/items', {
        section: 'FOOD',
        name: 'Yog‘',
        unit: 'LITER',
        initialQuantity: '3',
        minQuantity: '10',
      })
      .expect(201);
    await as(admin)
      .post('/warehouse/items', {
        section: 'FOOD',
        name: 'Un',
        unit: 'KG',
        initialQuantity: '50',
        minQuantity: '10',
      })
      .expect(201);

    const full = await data(as(admin).get('/dashboard/overview').expect(200));
    expect(full.counts).toMatchObject({
      today: 1,
      tomorrow: 1,
      week: 3,
      weekGuests: 450,
      active: 3,
    });
    expect(full.todayEvents).toMatchObject([
      {
        number: 1,
        guestCount: 300,
        tableCapacity: 12,
        firstDish: 'Osh',
        hallName: 'Oltin zal',
        shoppingListCount: 1,
        totalAmount: '60000000.00',
        debt: '45000000.00',
        workers: [{ fullName: 'Sardor Ofitsiant', roleAtEvent: 'Bosh ofitsiant' }],
      },
    ]);
    expect(full.week).toHaveLength(7);
    expect(full.week.map((item: { events: unknown[] }) => item.events.length)).toEqual([
      1, 1, 0, 0, 1, 0, 0,
    ]);
    expect(full.lowStock).toMatchObject([{ name: 'Yog‘', quantity: '3', minQuantity: '10' }]);
    expect(full.pendingShopping).toEqual({ toReview: 1, toConfirm: 0, toPurchase: 0 });
    expect(full.monthlyFinancials).toMatchObject({ totalCollected: '15000000.00' });

    // Zavzal: to'ylar va ishchilar ko'rinadi; pul, ombor va bozorlik — yo'q.
    const limited = await data(as(zavzal).get('/dashboard/overview').expect(200));
    expect(limited.counts).toEqual(full.counts);
    expect(limited).toMatchObject({
      lowStock: null,
      pendingShopping: null,
      monthlyFinancials: null,
    });
    expect(limited.todayEvents[0].workers).toHaveLength(1);
    expect(JSON.stringify(limited)).not.toMatch(/totalAmount|debt|000\.00/);

    // Admin: ombor va o'ziga yuborilgan bozorlik ko'rinadi, pul — yo'q.
    const forAdmin = await data(as(manager).get('/dashboard/overview').expect(200));
    expect(forAdmin).toMatchObject({ monthlyFinancials: null, pendingShopping: { toPurchase: 0 } });
    expect(forAdmin.lowStock).toHaveLength(1);
  });

  it('admin bron ochadi: narx menyu paketidan olinadi, o‘zi kiritgan narx va chegirma hisobga olinmaydi', async () => {
    const noPackage = await as(manager).post('/events', booking()).expect(400);
    expect(noPackage.body.error.code).toBe('MENU_PACKAGE_REQUIRED');

    const created = await data(
      as(manager)
        .post(
          '/events',
          booking({ menuPackageId: packageId, pricePerGuest: '1', discount: '59000000' }),
        )
        .expect(201),
    );
    expect(created).toMatchObject({ number: 1, menuPackage: { name: 'Premium' } });
    expect(created).not.toHaveProperty('totalAmount');
    expect(await data(as(admin).get(`/events/${created.id}`))).toMatchObject({
      pricePerGuest: '200000.00',
      discount: '0.00',
      totalAmount: '60000000.00',
    });

    // Mehmon soni o'zgarsa, kelishilgan 1 kishilik narx saqlanadi; narxni admin o'zgartira olmaydi.
    await as(admin).patch(`/menu/packages/${packageId}`, { pricePerGuest: '250000' }).expect(200);
    await as(manager)
      .patch(`/events/${created.id}`, { guestCount: 200, pricePerGuest: '5', discount: '39000000' })
      .expect(200);
    expect(await data(as(admin).get(`/events/${created.id}`))).toMatchObject({
      pricePerGuest: '200000.00',
      discount: '0.00',
      totalAmount: '40000000.00',
    });

    // Boshqa paketga o'tilsa — o'sha paket narxi.
    const vip = await data(
      as(admin).post('/menu/packages', { name: 'VIP', pricePerGuest: '280000', sections: [] }),
    );
    await as(manager).patch(`/events/${created.id}`, { menuPackageId: vip.id }).expect(200);
    expect(await data(as(admin).get(`/events/${created.id}`))).toMatchObject({
      pricePerGuest: '280000.00',
      totalAmount: '56000000.00',
    });
  });
});
