import sharp from 'sharp';
import { ActiveSuperAdmin, Authenticated, TestApp } from './utils/test-app';

const makePng = (width = 1600, height = 900) =>
  sharp({ create: { width, height, channels: 3, background: { r: 201, g: 162, b: 75 } } })
    .png()
    .toBuffer();

describe('Zallar va mijozlar (e2e)', () => {
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

  /** Berilgan ruxsatlarga ega rol va shu roldagi faol foydalanuvchi. */
  const userWith = async (name: string, permissions: string[]): Promise<Authenticated> => {
    const role = await t
      .http()
      .post('/api/v1/roles')
      .set(admin.auth)
      .send({ name, permissions })
      .expect(201);
    const user = await t.createActiveUser(admin, {
      email: `${name.toLowerCase()}@gavhar.test`,
      fullName: `${name} Xodim`,
      roleId: role.body.data.id,
    });
    await t.clearRateLimits();
    return user;
  };

  const hall = { name: 'Oltin zal', capacity: 400 };
  const createHall = async (overrides: object = {}) => {
    const res = await t
      .http()
      .post('/api/v1/halls')
      .set(admin.auth)
      .send({ ...hall, ...overrides })
      .expect(201);
    return res.body.data as { id: string; name: string; images: { id: string; url: string }[] };
  };

  describe('zallar', () => {
    it("yaratiladi, tahrirlanadi, filtrlanadi va o'chiriladi", async () => {
      const created = await t
        .http()
        .post('/api/v1/halls')
        .set(admin.auth)
        .send({ ...hall, description: '  Asosiy zal  ' })
        .expect(201);
      expect(created.body.data).toMatchObject({
        name: 'Oltin zal',
        capacity: 400,
        description: 'Asosiy zal',
        status: 'ACTIVE',
        images: [],
      });
      const id: string = created.body.data.id;

      const updated = await t
        .http()
        .patch(`/api/v1/halls/${id}`)
        .set(admin.auth)
        .send({ status: 'MAINTENANCE', capacity: 450 })
        .expect(200);
      expect(updated.body.data).toMatchObject({ status: 'MAINTENANCE', capacity: 450 });

      await createHall({ name: 'Kumush zal', capacity: 150 });
      const active = await t.http().get('/api/v1/halls?status=ACTIVE').set(admin.auth).expect(200);
      expect(active.body.data.map((h: { name: string }) => h.name)).toEqual(['Kumush zal']);
      const search = await t.http().get('/api/v1/halls?search=oltin').set(admin.auth).expect(200);
      expect(search.body.data).toHaveLength(1);

      await t.http().delete(`/api/v1/halls/${id}`).set(admin.auth).expect(204);
      await t.http().get(`/api/v1/halls/${id}`).set(admin.auth).expect(404);
      const all = await t.http().get('/api/v1/halls').set(admin.auth).expect(200);
      expect(all.body.data).toHaveLength(1);
    });

    it("nom takrorlanmaydi (katta-kichik harfga qaramay), o'chirilgan zal nomi bo'shaydi", async () => {
      const first = await createHall();

      const duplicate = await t
        .http()
        .post('/api/v1/halls')
        .set(admin.auth)
        .send({ ...hall, name: 'OLTIN ZAL' })
        .expect(409);
      expect(duplicate.body.error.code).toBe('HALL_NAME_TAKEN');

      await t.http().delete(`/api/v1/halls/${first.id}`).set(admin.auth).expect(204);
      await createHall();
    });

    it.each<[Record<string, unknown>, string]>([
      [{ capacity: 0 }, 'sig‘im 0'],
      [{ capacity: 12.5 }, 'kasr sig‘im'],
      [{ price: '15000000' }, 'zal uchun alohida narx yo‘q'],
      [{ name: 'A' }, 'juda qisqa nom'],
      [{ status: 'CLOSED' }, "noma'lum holat"],
      [{ deletedAt: null }, 'ortiqcha maydon'],
    ])('validatsiya: %j rad etiladi (%s)', async (override) => {
      const res = await t
        .http()
        .post('/api/v1/halls')
        .set(admin.auth)
        .send({ ...hall, ...override })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('zal yaratilishi audit logga yoziladi', async () => {
      const created = await createHall();

      const res = await t
        .http()
        .get(`/api/v1/audit-logs?resource=hall&resourceId=${created.id}`)
        .set(admin.auth)
        .expect(200);

      expect(res.body.data[0]).toMatchObject({
        action: 'hall.create',
        after: { name: 'Oltin zal', capacity: 400, status: 'ACTIVE' },
      });
    });
  });

  describe('zal rasmlari', () => {
    const upload = (hallId: string, file: Buffer, filename = 'zal.png', auth = admin.auth) =>
      t
        .http()
        .post(`/api/v1/halls/${hallId}/images`)
        .set(auth)
        .attach('file', file, { filename, contentType: 'image/png' });

    it("rasm WebP ga o'giriladi, yopiq bucket'da saqlanadi va imzolangan havola orqali ochiladi", async () => {
      const { id } = await createHall();

      const res = await upload(id, await makePng(3000, 2000)).expect(201);

      const [image] = res.body.data.images;
      expect(image).toMatchObject({ width: 2400, height: 1600 });

      const full = await fetch(image.url);
      expect(full.status).toBe(200);
      expect(full.headers.get('content-type')).toBe('image/webp');
      const thumb = await sharp(
        Buffer.from(await (await fetch(image.thumbUrl)).arrayBuffer()),
      ).metadata();
      expect(thumb).toMatchObject({ format: 'webp', width: 720, height: 480 });

      // Imzosiz to'g'ridan-to'g'ri murojaat rad etiladi.
      const unsigned = await fetch(image.url.split('?')[0]);
      expect(unsigned.status).toBe(403);
    });

    it('rasm bo‘lmagan fayl kengaytmasi va MIME turi soxtalashtirilgan bo‘lsa ham rad etiladi', async () => {
      const { id } = await createHall();

      const script = await upload(
        id,
        Buffer.from('<?php system($_GET["c"]); ?>'),
        'rasm.png',
      ).expect(400);
      expect(script.body.error.code).toBe('INVALID_IMAGE');

      const svg = await upload(
        id,
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
        'rasm.png',
      ).expect(400);
      expect(svg.body.error.code).toBe('INVALID_IMAGE');

      const missing = await t.http().post(`/api/v1/halls/${id}/images`).set(admin.auth).expect(400);
      expect(missing.body.error.code).toBe('FILE_REQUIRED');

      const stored = await t.prisma.hallImage.count();
      expect(stored).toBe(0);
    });

    it('10 MB dan katta fayl qabul qilinmaydi', async () => {
      const { id } = await createHall();

      const res = await upload(id, Buffer.alloc(10 * 1024 * 1024 + 1, 1), 'katta.png').expect(413);

      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it("tartib o'zgartiriladi (birinchisi — muqova) va rasm o'chirilganda fayl ham o'chadi", async () => {
      const { id } = await createHall();
      await upload(id, await makePng(800, 600)).expect(201);
      const second = await upload(id, await makePng(600, 800)).expect(201);
      const [first, last] = second.body.data.images as [
        { id: string; url: string },
        { id: string; url: string },
      ];

      const reordered = await t
        .http()
        .put(`/api/v1/halls/${id}/images/order`)
        .set(admin.auth)
        .send({ imageIds: [last.id, first.id] })
        .expect(200);
      expect(reordered.body.data.images.map((i: { id: string }) => i.id)).toEqual([
        last.id,
        first.id,
      ]);

      const invalid = await t
        .http()
        .put(`/api/v1/halls/${id}/images/order`)
        .set(admin.auth)
        .send({ imageIds: [first.id] })
        .expect(400);
      expect(invalid.body.error.code).toBe('HALL_IMAGE_ORDER_INVALID');

      const removed = await t
        .http()
        .delete(`/api/v1/halls/${id}/images/${first.id}`)
        .set(admin.auth)
        .expect(200);
      expect(removed.body.data.images).toHaveLength(1);
      expect((await fetch(first.url)).status).toBe(404);
      expect((await fetch(last.url)).status).toBe(200);
    });
  });

  describe('ruxsatlar (@Permissions)', () => {
    it("faqat ko'rish ruxsati bor foydalanuvchi o'zgartira olmaydi", async () => {
      const { id } = await createHall();
      const viewer = await userWith('Kuzatuvchi', ['halls:read', 'clients:read']);

      await viewer.agent.get('/api/v1/halls').set(viewer.auth).expect(200);
      await viewer.agent.get(`/api/v1/halls/${id}`).set(viewer.auth).expect(200);

      const create = await viewer.agent
        .post('/api/v1/halls')
        .set(viewer.auth)
        .send(hall)
        .expect(403);
      expect(create.body.error).toMatchObject({
        code: 'FORBIDDEN',
        details: { missingPermissions: ['halls:create'] },
      });
      await viewer.agent
        .patch(`/api/v1/halls/${id}`)
        .set(viewer.auth)
        .send({ capacity: 1 })
        .expect(403);
      await viewer.agent.delete(`/api/v1/halls/${id}`).set(viewer.auth).expect(403);
      await viewer.agent
        .post(`/api/v1/halls/${id}/images`)
        .set(viewer.auth)
        .attach('file', await makePng(64, 64), 'zal.png')
        .expect(403);
      await viewer.agent
        .post('/api/v1/clients')
        .set(viewer.auth)
        .send({ fullName: 'Test Mijoz', phone: '+998901234567' })
        .expect(403);
    });

    it("ruxsati yo'q bo'lim butunlay yopiq, ruxsat berilgach ochiladi", async () => {
      const cashier = await userWith('Kassir', ['finance:read']);

      await cashier.agent.get('/api/v1/halls').set(cashier.auth).expect(403);
      await cashier.agent.get('/api/v1/clients').set(cashier.auth).expect(403);

      const me = await cashier.agent.get('/api/v1/auth/me').set(cashier.auth).expect(200);
      await t
        .http()
        .patch(`/api/v1/roles/${me.body.data.role.id}`)
        .set(admin.auth)
        .send({ permissions: ['finance:read', 'halls:read'] })
        .expect(200);

      await cashier.agent.get('/api/v1/halls').set(cashier.auth).expect(200);
      await cashier.agent.get('/api/v1/clients').set(cashier.auth).expect(403);
    });
  });

  describe('mijozlar', () => {
    const client = { fullName: 'Karimov Anvar', phone: '+998901234567' };
    const post = (body: object) => t.http().post('/api/v1/clients').set(admin.auth).send(body);

    it('telefon bir xil formatga keltiriladi', async () => {
      const res = await post({
        fullName: '  Karimov Anvar ',
        phone: '+998 (90) 123-45-67',
        phoneExtra: '+998 93 111 22 33',
        note: ' Doimiy mijoz ',
      }).expect(201);

      expect(res.body.data).toMatchObject({
        fullName: 'Karimov Anvar',
        phone: '+998901234567',
        phoneExtra: '+998931112233',
        note: 'Doimiy mijoz',
      });
    });

    it.each([
      ['901234567', 'mamlakat kodisiz'],
      ['+99890123456', 'qisqa'],
      ['+7 900 123 45 67', 'boshqa mamlakat'],
      ['+998 90 abc 45 67', 'harfli'],
    ])('noto‘g‘ri telefon rad etiladi: %s (%s)', async (phone) => {
      await post({ ...client, phone }).expect(400);
    });

    it('bitta raqam bilan ikkinchi mijoz ochilmaydi; javobda mavjud mijoz ko‘rsatiladi', async () => {
      const first = await post(client).expect(201);

      const duplicate = await post({ fullName: 'Boshqa Odam', phone: '+998 90 123 45 67' }).expect(
        409,
      );

      expect(duplicate.body.error).toMatchObject({
        code: 'CLIENT_PHONE_TAKEN',
        details: { clientId: first.body.data.id, fullName: 'Karimov Anvar' },
      });
    });

    it('bir vaqtda kelgan bir xil raqamli so‘rovlardan faqat bittasi o‘tadi', async () => {
      const responses = await Promise.all(
        Array.from({ length: 6 }, (_, index) => post({ ...client, fullName: `Mijoz ${index}` })),
      );

      const statuses = responses.map((res) => res.status).sort();
      expect(statuses).toEqual([201, 409, 409, 409, 409, 409]);
      expect(await t.prisma.client.count()).toBe(1);
    });

    it("qidiruv ism va telefon raqamlari bo'yicha ishlaydi, natija sahifalanadi", async () => {
      await post({ fullName: 'Karimov Anvar', phone: '+998901234567' }).expect(201);
      await post({ fullName: 'Aliyeva Nodira', phone: '+998935557788' }).expect(201);
      await post({
        fullName: 'Yusupov Bobur',
        phone: '+998977001122',
        phoneExtra: '+998901230000',
      }).expect(201);
      const search = async (query: string) => {
        const res = await t
          .http()
          .get(`/api/v1/clients?search=${encodeURIComponent(query)}&sortBy=fullName&sortOrder=asc`)
          .set(admin.auth)
          .expect(200);
        return res.body.data.map((c: { fullName: string }) => c.fullName);
      };

      expect(await search('KARIM')).toEqual(['Karimov Anvar']);
      expect(await search('93 555')).toEqual(['Aliyeva Nodira']);
      // Qo'shimcha raqam bo'yicha ham topiladi.
      expect(await search('90 123')).toEqual(['Karimov Anvar', 'Yusupov Bobur']);
      expect(await search('yoq')).toEqual([]);

      const page = await t.http().get('/api/v1/clients?limit=2&page=2').set(admin.auth).expect(200);
      expect(page.body.meta).toMatchObject({ total: 3, totalPages: 2, hasPrev: true });
      expect(page.body.data).toHaveLength(1);
    });

    it("tahrirlashda boshqa mijozning raqamini olib bo'lmaydi; o'chirilgan mijoz raqami bo'shaydi", async () => {
      const first = await post(client).expect(201);
      const second = await post({ fullName: 'Aliyeva Nodira', phone: '+998935557788' }).expect(201);
      const patch = (id: string, body: object) =>
        t.http().patch(`/api/v1/clients/${id}`).set(admin.auth).send(body);

      await patch(second.body.data.id, { phone: client.phone }).expect(409);
      const same = await patch(first.body.data.id, { phone: client.phone, note: 'VIP' }).expect(
        200,
      );
      expect(same.body.data.note).toBe('VIP');
      const cleared = await patch(first.body.data.id, { note: null, phoneExtra: '' }).expect(200);
      expect(cleared.body.data).toMatchObject({ note: null, phoneExtra: null });

      await t.http().delete(`/api/v1/clients/${first.body.data.id}`).set(admin.auth).expect(204);
      await t.http().get(`/api/v1/clients/${first.body.data.id}`).set(admin.auth).expect(404);
      await patch(second.body.data.id, { phone: client.phone }).expect(200);
    });
  });
});
