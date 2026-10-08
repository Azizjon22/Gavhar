import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { seedDemoContent } from '../prisma/seed/demo-content';
import { VideoProcessingService } from '@/modules/gallery/video-processing.service';
import { ActiveSuperAdmin, TestApp } from './utils/test-app';

/** ffmpeg yaratgan 2 soniyalik haqiqiy MP4. */
const makeVideo = (): Buffer =>
  execFileSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=2:size=320x240:rate=10',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      'frag_keyframe+empty_moov',
      '-f',
      'mp4',
      'pipe:1',
    ],
    { maxBuffer: 20 * 1024 * 1024 },
  );

/** ffmpeg'ning ixtiyoriy sozlamalari bilan yaratilgan qisqa video (fayl orqali — indeks oxirida qoladi). */
const makeClip = (name: string, args: string[]): Buffer => {
  const dir = mkdtempSync(join(tmpdir(), 'gavhar-e2e-video-'));
  try {
    const path = join(dir, name);
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', ...args, path]);
    return readFileSync(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const probeUrl = (url: string) =>
  (
    JSON.parse(
      execFileSync(
        'ffprobe',
        [
          '-v',
          'error',
          '-select_streams',
          'v:0',
          '-show_entries',
          'stream=codec_name,width,height,pix_fmt',
          '-of',
          'json',
          url,
        ],
        { encoding: 'utf8' },
      ),
    ) as { streams: { codec_name: string; width: number; height: number; pix_fmt: string }[] }
  ).streams[0];

describe('Menyu va galereya (e2e)', () => {
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

  const api = () => t.http();
  const post = (path: string, body: object = {}) =>
    api().post(`/api/v1${path}`).set(admin.auth).send(body);
  const get = (path: string) => api().get(`/api/v1${path}`).set(admin.auth);
  const videos = () => t.app.get(VideoProcessingService);

  describe('menyu', () => {
    it('boshlang‘ich kontent: 11 bo‘lim va 160/200/280 minglik uchta paket', async () => {
      const first = await seedDemoContent(t.prisma);
      const second = await seedDemoContent(t.prisma);
      expect(first).toEqual({ menuCreated: true, albumsCreated: true });
      expect(second).toEqual({ menuCreated: false, albumsCreated: false });

      const packages = (await get('/menu/packages').expect(200)).body.data;
      expect(
        packages.map((p: { name: string; pricePerGuest: string }) => [p.name, p.pricePerGuest]),
      ).toEqual([
        ['Standart', '160000.00'],
        ['Premium', '200000.00'],
        ['VIP', '280000.00'],
      ]);
      expect(packages[2].badge).toBe('VIP');
      expect(packages[0].sections).toHaveLength(11);
      expect(packages[0].sections.slice(0, 3)).toEqual([
        expect.objectContaining({ nameUz: 'Salatlar', nameRu: 'Салаты', kindsCount: 4 }),
        expect.objectContaining({ nameUz: 'Suyuq taomlar', kindsCount: 4 }),
        expect.objectContaining({ nameUz: 'Quyuq taomlar', kindsCount: 4 }),
      ]);
      const albums = (await get('/gallery/albums').expect(200)).body.data;
      expect(albums.map((a: { title: string }) => a.title)).toContain('Wedding Studio Gavhar');
    });

    it("paket yaratiladi, tarkibi va narxi o'zgartiriladi; narx tarixi saqlanadi", async () => {
      const salads = (
        await post('/menu/categories', { nameUz: 'Salatlar', nameRu: 'Салаты' }).expect(201)
      ).body.data;
      const drinks = (
        await post('/menu/categories', { nameUz: 'Ichimliklar', nameRu: 'Напитки' }).expect(201)
      ).body.data;
      await post('/menu/categories', { nameUz: 'salatlar', nameRu: 'x x' }).expect(409);

      const created = await post('/menu/packages', {
        name: 'Gold',
        pricePerGuest: '240000',
        badge: 'Yangi',
        sections: [
          { categoryId: drinks.id, kindsCount: 3 },
          { categoryId: salads.id, kindsCount: 4, items: [' Sezar ', 'Olivye', ''] },
        ],
      }).expect(201);
      const pkg = created.body.data;
      // Bo'limlar kategoriya tartibida qaytadi, bo'sh nomlar tashlab yuboriladi.
      expect(pkg.sections).toEqual([
        expect.objectContaining({ nameUz: 'Salatlar', kindsCount: 4, items: ['Sezar', 'Olivye'] }),
        expect.objectContaining({ nameUz: 'Ichimliklar', kindsCount: 3, items: [] }),
      ]);

      const updated = await api()
        .patch(`/api/v1/menu/packages/${pkg.id}`)
        .set(admin.auth)
        .send({ pricePerGuest: '260000', sections: [{ categoryId: salads.id, kindsCount: 5 }] })
        .expect(200);
      expect(updated.body.data).toMatchObject({ pricePerGuest: '260000.00', badge: 'Yangi' });
      expect(updated.body.data.sections).toHaveLength(1);

      // Narx o'zgarmagan tahrir tarixga yozilmaydi.
      await api()
        .patch(`/api/v1/menu/packages/${pkg.id}`)
        .set(admin.auth)
        .send({ description: 'Tavsif' })
        .expect(200);
      const history = (await get(`/menu/packages/${pkg.id}/prices`).expect(200)).body.data;
      expect(history.map((row: { price: string }) => row.price)).toEqual([
        '260000.00',
        '240000.00',
      ]);

      // Bo'lim o'chirilsa, paket tarkibidan ham chiqadi.
      await api().delete(`/api/v1/menu/categories/${salads.id}`).set(admin.auth).expect(204);
      const afterDelete = (await get('/menu/packages').expect(200)).body.data;
      expect(afterDelete[0].sections).toEqual([]);

      await post('/menu/packages', { name: 'gold', pricePerGuest: '1', sections: [] }).expect(409);
      await post('/menu/packages', { name: 'Xato', pricePerGuest: '-5', sections: [] }).expect(400);
      await post('/menu/packages', {
        name: 'Xato',
        pricePerGuest: '100',
        sections: [{ categoryId: salads.id, kindsCount: 1 }],
      }).expect(404);
    });

    it('taomlar katalogi: paketdagi nomlarga rasm va tavsif beriladi', async () => {
      const salads = (
        await post('/menu/categories', { nameUz: 'Salatlar', nameRu: 'Салаты' }).expect(201)
      ).body.data;
      for (const name of ['Standart', 'Premium']) {
        await post('/menu/packages', {
          name,
          pricePerGuest: '200000',
          sections: [
            {
              categoryId: salads.id,
              kindsCount: 2,
              items: name === 'Premium' ? ['Sezar', 'Olivye'] : ['Sezar'],
            },
          ],
        }).expect(201);
      }

      expect((await get('/menu/dishes').expect(200)).body.data).toEqual([
        { name: 'Olivye', description: null, photo: null, packages: 1 },
        { name: 'Sezar', description: null, photo: null, packages: 2 },
      ]);

      await api()
        .put('/api/v1/menu/dishes')
        .set(admin.auth)
        .send({ name: ' sezar ', description: 'Tovuq, salat bargi, parmezan' })
        .expect(200);
      const png = await sharp({
        create: { width: 800, height: 600, channels: 3, background: '#C9A24B' },
      })
        .png()
        .toBuffer();
      const withPhoto = await api()
        .post('/api/v1/menu/dishes/photo?name=SEZAR')
        .set(admin.auth)
        .attach('file', png, { filename: 'sezar.png', contentType: 'image/png' })
        .expect(201);
      expect((await fetch(withPhoto.body.data.photo.thumbUrl)).status).toBe(200);
      // Paketda yo'q taomga ham rasm qo'yish mumkin — keyin paketga qo'shilganda ko'rinadi.
      await api()
        .post('/api/v1/menu/dishes/photo?name=Achchiq-chuchuk')
        .set(admin.auth)
        .attach('file', png, { filename: 'a.png', contentType: 'image/png' })
        .expect(201);

      const dishes = (await get('/menu/dishes').expect(200)).body.data;
      expect(
        dishes.map(
          (dish: {
            name: string;
            packages: number;
            description: string | null;
            photo: unknown;
          }) => [dish.name, dish.packages, dish.description, dish.photo !== null],
        ),
      ).toEqual([
        ['Achchiq-chuchuk', 0, null, true],
        ['Olivye', 1, null, false],
        ['Sezar', 2, 'Tovuq, salat bargi, parmezan', true],
      ]);

      await api().delete('/api/v1/menu/dishes/photo?name=Sezar').set(admin.auth).expect(200);
      await api().delete('/api/v1/menu/dishes/photo?name=Sezar').set(admin.auth).expect(404);
    });

    it('paket muqovasi: rasm yuklanadi, almashtirilganda eskisi o‘chadi, olib tashlanadi', async () => {
      const salads = (
        await post('/menu/categories', { nameUz: 'Salatlar', nameRu: 'Салаты' }).expect(201)
      ).body.data;
      const pkg = (
        await post('/menu/packages', {
          name: 'VIP',
          pricePerGuest: '280000',
          sections: [{ categoryId: salads.id, kindsCount: 4 }],
        }).expect(201)
      ).body.data;
      expect(pkg.cover).toBeNull();

      const image = (background: string) =>
        sharp({ create: { width: 1600, height: 1200, channels: 3, background } })
          .jpeg()
          .toBuffer();
      const upload = async (background: string) =>
        (
          await api()
            .post(`/api/v1/menu/packages/${pkg.id}/cover`)
            .set(admin.auth)
            .attach('file', await image(background), {
              filename: 'cover.jpg',
              contentType: 'image/jpeg',
            })
            .expect(201)
        ).body.data;

      const first = await upload('#0F4D3A');
      expect(first).toMatchObject({ id: pkg.id, name: 'VIP' });
      const stored = await sharp(
        Buffer.from(await (await fetch(first.cover.url)).arrayBuffer()),
      ).metadata();
      expect(stored).toMatchObject({ format: 'webp', width: 1600 });
      expect((await fetch(first.cover.thumbUrl)).status).toBe(200);

      const second = await upload('#C9A24B');
      expect(second.cover.url.split('?')[0]).not.toBe(first.cover.url.split('?')[0]);
      expect((await fetch(first.cover.url)).status).toBe(404);
      // Ro'yxatda ham, paket tahrirlanganda ham muqova saqlanib qoladi.
      const listed = (await get('/menu/packages').expect(200)).body.data;
      expect(listed[0].cover.url.split('?')[0]).toBe(second.cover.url.split('?')[0]);
      const renamed = await api()
        .patch(`/api/v1/menu/packages/${pkg.id}`)
        .set(admin.auth)
        .send({ description: 'Eng to‘kin dasturxon' })
        .expect(200);
      expect(renamed.body.data.cover).not.toBeNull();

      await api()
        .post(`/api/v1/menu/packages/${pkg.id}/cover`)
        .set(admin.auth)
        .attach('file', Buffer.from('rasm emas'), { filename: 'x.jpg', contentType: 'image/jpeg' })
        .expect(400);

      const removed = await api()
        .delete(`/api/v1/menu/packages/${pkg.id}/cover`)
        .set(admin.auth)
        .expect(200);
      expect(removed.body.data.cover).toBeNull();
      expect((await fetch(second.cover.url)).status).toBe(404);
    });

    it("bo'limlar tartibi o'zgartiriladi", async () => {
      const a = (
        await post('/menu/categories', { nameUz: 'Birinchi', nameRu: 'Первый' }).expect(201)
      ).body.data;
      const b = (
        await post('/menu/categories', { nameUz: 'Ikkinchi', nameRu: 'Второй' }).expect(201)
      ).body.data;

      const reordered = await api()
        .put('/api/v1/menu/categories/order')
        .set(admin.auth)
        .send({ ids: [b.id, a.id] })
        .expect(200);
      expect(reordered.body.data.map((c: { nameUz: string }) => c.nameUz)).toEqual([
        'Ikkinchi',
        'Birinchi',
      ]);
      await api()
        .put('/api/v1/menu/categories/order')
        .set(admin.auth)
        .send({ ids: [a.id] })
        .expect(400);
    });

    it("bronda paket nomi saqlanadi: paket keyin o'zgarsa ham eski bron o'zgarmaydi", async () => {
      const hall = (await post('/halls', { name: 'Oltin zal', capacity: 400 }).expect(201)).body
        .data;
      const client = (
        await post('/clients', { fullName: 'Karimov Anvar', phone: '+998901234567' }).expect(201)
      ).body.data;
      const pkg = (
        await post('/menu/packages', { name: 'VIP', pricePerGuest: '280000', sections: [] }).expect(
          201,
        )
      ).body.data;
      const start = new Date(Date.now() + 20 * 86_400_000);
      const booking = {
        clientId: client.id,
        hallId: hall.id,
        type: 'WEDDING',
        startAt: start.toISOString(),
        endAt: new Date(start.getTime() + 5 * 3_600_000).toISOString(),
        guestCount: 100,
        pricePerGuest: pkg.pricePerGuest,
        menuPackageId: pkg.id,
      };

      const event = (await post('/events', booking).expect(201)).body.data;
      expect(event).toMatchObject({
        menuPackage: { id: pkg.id, name: 'VIP' },
        totalAmount: '28000000.00',
      });

      await api()
        .patch(`/api/v1/menu/packages/${pkg.id}`)
        .set(admin.auth)
        .send({ name: 'VIP Gold', pricePerGuest: '350000' })
        .expect(200);
      const same = (await get(`/events/${event.id}`).expect(200)).body.data;
      expect(same).toMatchObject({
        menuPackage: { name: 'VIP' },
        pricePerGuest: '280000.00',
        totalAmount: '28000000.00',
      });

      // O'chirib qo'yilgan paketni yangi bronga tanlab bo'lmaydi; eski bron esa ochilaveradi.
      await api()
        .patch(`/api/v1/menu/packages/${pkg.id}`)
        .set(admin.auth)
        .send({ isActive: false })
        .expect(200);
      const rejected = await post('/events', {
        ...booking,
        startAt: new Date(start.getTime() + 86_400_000).toISOString(),
        endAt: new Date(start.getTime() + 90_000_000).toISOString(),
      }).expect(400);
      expect(rejected.body.error.code).toBe('MENU_PACKAGE_NOT_FOUND');
      await api().delete(`/api/v1/menu/packages/${pkg.id}`).set(admin.auth).expect(204);
      await get(`/events/${event.id}`).expect(200);

      const cleared = await api()
        .patch(`/api/v1/events/${event.id}`)
        .set(admin.auth)
        .send({ menuPackageId: null })
        .expect(200);
      expect(cleared.body.data.menuPackage).toBeNull();
    });
  });

  describe('galereya', () => {
    const createAlbum = async () =>
      (
        await post('/gallery/albums', {
          title: 'Umumiy zal',
          description: 'Zalning umumiy ko‘rinishi',
        }).expect(201)
      ).body.data as { id: string; menuPackageId: string | null };

    it('rasm yuklanadi va imzolangan havola orqali ochiladi', async () => {
      const album = await createAlbum();
      const png = await sharp({
        create: { width: 1800, height: 1200, channels: 3, background: '#0f4c3a' },
      })
        .png()
        .toBuffer();

      const res = await api()
        .post(`/api/v1/gallery/albums/${album.id}/images`)
        .set(admin.auth)
        .attach('file', png, { filename: 'zal.png', contentType: 'image/png' })
        .expect(201);
      const [item] = res.body.data.items;
      expect(item).toMatchObject({
        kind: 'IMAGE',
        width: 1800,
        height: 1200,
        mimeType: 'image/webp',
      });
      expect((await fetch(item.thumbUrl)).status).toBe(200);

      await api()
        .post(`/api/v1/gallery/albums/${album.id}/images`)
        .set(admin.auth)
        .attach('file', Buffer.from('rasm emas'), { filename: 'x.png', contentType: 'image/png' })
        .expect(400);
    });

    it('albom menyu paketiga biriktiriladi; paket o‘chirilsa albom umumiy bo‘lib qoladi', async () => {
      const category = (
        await post('/menu/categories', { nameUz: 'Salatlar', nameRu: 'Салаты' }).expect(201)
      ).body.data;
      const pkg = (
        await post('/menu/packages', {
          name: 'VIP',
          pricePerGuest: '280000',
          sections: [{ categoryId: category.id, kindsCount: 4 }],
        }).expect(201)
      ).body.data;

      const general = await createAlbum();
      expect(general.menuPackageId).toBeNull();
      const linked = (
        await post('/gallery/albums', { title: 'VIP stol bezagi', menuPackageId: pkg.id }).expect(
          201,
        )
      ).body.data;
      expect(linked.menuPackageId).toBe(pkg.id);

      const patch = (id: string, body: object) =>
        api().patch(`/api/v1/gallery/albums/${id}`).set(admin.auth).send(body);
      // Nomi o'zgarganda bog'lanish saqlanadi; null yuborilsa — uziladi.
      expect(
        (await patch(linked.id, { title: 'VIP dasturxon' }).expect(200)).body.data.menuPackageId,
      ).toBe(pkg.id);
      expect(
        (await patch(general.id, { menuPackageId: pkg.id }).expect(200)).body.data.menuPackageId,
      ).toBe(pkg.id);
      expect(
        (await patch(general.id, { menuPackageId: null }).expect(200)).body.data.menuPackageId,
      ).toBeNull();

      const missing = await patch(general.id, {
        menuPackageId: '00000000-0000-4000-8000-000000000000',
      }).expect(404);
      expect(missing.body.error.code).toBe('MENU_PACKAGE_NOT_FOUND');
      await patch(general.id, { menuPackageId: 'paket' }).expect(400);

      await api().delete(`/api/v1/menu/packages/${pkg.id}`).set(admin.auth).expect(204);
      const albums = (await get('/gallery/albums').expect(200)).body.data;
      expect(albums.map((album: { menuPackageId: string | null }) => album.menuPackageId)).toEqual([
        null,
        null,
      ]);
      await post('/gallery/albums', { title: 'Eski paket', menuPackageId: pkg.id }).expect(404);
    });

    it("video brauzerdan to'g'ridan-to'g'ri saqlash joyiga yuklanadi; muqova va davomiylik aniqlanadi", async () => {
      const album = await createAlbum();
      const video = makeVideo();

      const init = (
        await post(`/gallery/albums/${album.id}/videos/init`, {
          contentType: 'video/mp4',
          size: video.length,
        }).expect(200)
      ).body.data;
      expect(init.key).toMatch(new RegExp(`^gallery/${album.id}/[0-9a-f-]{36}\\.mp4$`));
      const upload = await fetch(init.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'video/mp4' },
        body: new Uint8Array(video),
      });
      expect(upload.status).toBe(200);

      const done = await post(`/gallery/albums/${album.id}/videos/complete`, {
        key: init.key,
      }).expect(201);
      const [item] = done.body.data.items;
      expect(item).toMatchObject({
        kind: 'VIDEO',
        mimeType: 'video/mp4',
        sizeBytes: video.length,
        durationSec: 2,
        width: 320,
        height: 240,
        processingStatus: 'PROCESSING',
      });
      // Ideal video (H.264, indeksi boshida) qayta ishlanmaydi — fayl o'sha-o'zi qoladi.
      await videos().idle();
      const [kept] = (await get('/gallery/albums').expect(200)).body.data[0].items;
      expect(kept).toMatchObject({ processingStatus: 'READY', sizeBytes: video.length });
      expect(kept.url.split('?')[0]).toBe(item.url.split('?')[0]);
      const poster = await sharp(
        Buffer.from(await (await fetch(item.thumbUrl)).arrayBuffer()),
      ).metadata();
      expect(poster.format).toBe('webp');
      const played = await fetch(item.url, { headers: { Range: 'bytes=0-99' } });
      expect(played.status).toBe(206);

      // Bitta yuklash ikki marta qo'shilmaydi.
      const twice = await post(`/gallery/albums/${album.id}/videos/complete`, {
        key: init.key,
      }).expect(409);
      expect(twice.body.error.code).toBe('UPLOAD_ALREADY_COMPLETED');

      const removed = await api()
        .delete(`/api/v1/gallery/albums/${album.id}/items/${item.id}`)
        .set(admin.auth)
        .expect(200);
      expect(removed.body.data.items).toEqual([]);
      expect((await fetch(item.url)).status).toBe(404);
    });

    const uploadVideo = async (albumId: string, contentType: string, video: Buffer) => {
      const init = (
        await post(`/gallery/albums/${albumId}/videos/init`, {
          contentType,
          size: video.length,
        }).expect(200)
      ).body.data;
      const upload = await fetch(init.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: new Uint8Array(video),
      });
      expect(upload.status).toBe(200);
      const done = await post(`/gallery/albums/${albumId}/videos/complete`, {
        key: init.key,
      }).expect(201);
      return done.body.data.items.at(-1);
    };
    const itemsOf = async (albumId: string) =>
      (await get('/gallery/albums').expect(200)).body.data.find(
        (album: { id: string }) => album.id === albumId,
      ).items;

    it('indeksi oxirida turgan video qayta kodlanmasdan qayta o‘raladi va darhol o‘ynaydi', async () => {
      const album = await createAlbum();
      const video = makeClip('clip.mp4', [
        '-i',
        'testsrc=duration=2:size=320x240:rate=10',
        '-pix_fmt',
        'yuv420p',
      ]);
      expect(video.indexOf('moov')).toBeGreaterThan(video.indexOf('mdat'));

      const uploaded = await uploadVideo(album.id, 'video/mp4', video);
      expect(uploaded.processingStatus).toBe('PROCESSING');
      // Qayta ishlanayotganda ham asl fayl o'ynayveradi.
      expect((await fetch(uploaded.url, { headers: { Range: 'bytes=0-9' } })).status).toBe(206);

      await videos().idle();
      const [item] = await itemsOf(album.id);
      expect(item).toMatchObject({
        id: uploaded.id,
        processingStatus: 'READY',
        mimeType: 'video/mp4',
        width: 320,
        height: 240,
        durationSec: 2,
      });
      expect(item.url.split('?')[0]).not.toBe(uploaded.url.split('?')[0]);
      const stored = Buffer.from(await (await fetch(item.url)).arrayBuffer());
      expect(stored.length).toBe(item.sizeBytes);
      expect(stored.indexOf('moov')).toBeLessThan(stored.indexOf('mdat'));
      expect(probeUrl(item.url)).toMatchObject({ codec_name: 'h264', width: 320, height: 240 });
      // Asl fayl o'rniga yangisi yozilgach, eskisi o'chiriladi.
      expect((await fetch(uploaded.url)).status).toBe(404);
    });

    it('iPhone MOV va katta o‘lchamli video H.264 MP4 (1080p) ga aylantiriladi', async () => {
      const album = await createAlbum();
      const video = makeClip('clip.mov', [
        '-i',
        'testsrc=duration=1:size=1920x1440:rate=5',
        '-c:v',
        'mpeg4',
      ]);

      const uploaded = await uploadVideo(album.id, 'video/quicktime', video);
      expect(uploaded).toMatchObject({
        mimeType: 'video/quicktime',
        processingStatus: 'PROCESSING',
        width: 1920,
        height: 1440,
      });

      await videos().idle();
      const [item] = await itemsOf(album.id);
      expect(item).toMatchObject({
        processingStatus: 'READY',
        mimeType: 'video/mp4',
        width: 1440,
        height: 1080,
      });
      expect(probeUrl(item.url)).toEqual({
        codec_name: 'h264',
        width: 1440,
        height: 1080,
        pix_fmt: 'yuv420p',
      });
      expect((await fetch(uploaded.url)).status).toBe(404);
    }, 120_000);

    it('qayta ishlab bo‘lmagan video yuklangan holicha qoladi; uni qayta navbatga qo‘yish mumkin', async () => {
      const album = await createAlbum();
      // Sarlavhasi MP4, ichi yaroqsiz: tur tekshiruvidan o'tadi, ffmpeg esa o'qiy olmaydi.
      const broken = Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x20]),
        Buffer.from('ftypisom', 'latin1'),
        Buffer.alloc(500),
      ]);
      const uploaded = await uploadVideo(album.id, 'video/mp4', broken);
      expect(uploaded).toMatchObject({ processingStatus: 'PROCESSING', thumbUrl: null });

      await videos().idle();
      const [failed] = await itemsOf(album.id);
      expect(failed).toMatchObject({ processingStatus: 'FAILED', sizeBytes: broken.length });
      expect((await fetch(failed.url)).status).toBe(200);

      const retried = await post(`/gallery/albums/${album.id}/items/${failed.id}/reprocess`).expect(
        200,
      );
      expect(retried.body.data.items[0].processingStatus).toBe('PROCESSING');
      await videos().idle();
      expect((await itemsOf(album.id))[0].processingStatus).toBe('FAILED');

      // Tayyor video va rasm uchun bu amal kerak emas.
      const good = await uploadVideo(album.id, 'video/mp4', makeVideo());
      await videos().idle();
      const again = await post(`/gallery/albums/${album.id}/items/${good.id}/reprocess`).expect(
        409,
      );
      expect(again.body.error.code).toBe('VIDEO_REPROCESS_NOT_NEEDED');
    });

    it('qayta ishlash paytida o‘chirilgan videodan hech narsa qolmaydi', async () => {
      const album = await createAlbum();
      const uploaded = await uploadVideo(
        album.id,
        'video/mp4',
        makeClip('clip.mp4', [
          '-i',
          'testsrc=duration=2:size=320x240:rate=10',
          '-pix_fmt',
          'yuv420p',
        ]),
      );
      await api()
        .delete(`/api/v1/gallery/albums/${album.id}/items/${uploaded.id}`)
        .set(admin.auth)
        .expect(200);
      await videos().idle();
      expect(await itemsOf(album.id)).toEqual([]);
      expect(await t.prisma.galleryItem.count()).toBe(0);
    });

    it('video bo‘lmagan fayl, begona kalit va yuklanmagan fayl rad etiladi', async () => {
      const album = await createAlbum();
      const other = await createAlbum();

      const init = (
        await post(`/gallery/albums/${album.id}/videos/init`, {
          contentType: 'video/mp4',
          size: 20,
        }).expect(200)
      ).body.data;
      const missing = await post(`/gallery/albums/${album.id}/videos/complete`, {
        key: init.key,
      }).expect(400);
      expect(missing.body.error.code).toBe('UPLOAD_NOT_FOUND');

      await fetch(init.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'video/mp4' },
        body: '<?php echo 1; ?> video emas',
      });
      const fake = await post(`/gallery/albums/${album.id}/videos/complete`, {
        key: init.key,
      }).expect(400);
      expect(fake.body.error.code).toBe('INVALID_VIDEO');
      // Soxta fayl saqlash joyidan ham o'chiriladi.
      expect(
        (await post(`/gallery/albums/${album.id}/videos/complete`, { key: init.key }).expect(400))
          .body.error.code,
      ).toBe('UPLOAD_NOT_FOUND');

      const foreign = await post(`/gallery/albums/${other.id}/videos/complete`, {
        key: init.key,
      }).expect(400);
      expect(foreign.body.error.code).toBe('UPLOAD_KEY_INVALID');
      await post(`/gallery/albums/${album.id}/videos/init`, {
        contentType: 'application/x-msdownload',
        size: 10,
      }).expect(400);
      await post(`/gallery/albums/${album.id}/videos/init`, {
        contentType: 'video/mp4',
        size: 3 * 1024 ** 3,
      }).expect(400);
    });

    it("ruxsat: faqat ko'rish huquqi bor foydalanuvchi yuklay va o'chira olmaydi", async () => {
      const album = await createAlbum();
      const role = (
        await post('/roles', { name: 'Mehmon', permissions: ['media:read', 'menu:read'] }).expect(
          201,
        )
      ).body.data;
      const viewer = await t.createActiveUser(admin, {
        email: 'mehmon@gavhar.test',
        fullName: 'Mehmon Xodim',
        roleId: role.id,
      });

      await viewer.agent.get('/api/v1/gallery/albums').set(viewer.auth).expect(200);
      await viewer.agent.get('/api/v1/menu/packages').set(viewer.auth).expect(200);
      await viewer.agent
        .post('/api/v1/gallery/albums')
        .set(viewer.auth)
        .send({ title: 'Yangi' })
        .expect(403);
      await viewer.agent
        .post(`/api/v1/gallery/albums/${album.id}/videos/init`)
        .set(viewer.auth)
        .send({ contentType: 'video/mp4', size: 10 })
        .expect(403);
      await viewer.agent.delete(`/api/v1/gallery/albums/${album.id}`).set(viewer.auth).expect(403);
      await viewer.agent
        .post('/api/v1/menu/packages')
        .set(viewer.auth)
        .send({ name: 'X', pricePerGuest: '1', sections: [] })
        .expect(403);
    });
  });
});
