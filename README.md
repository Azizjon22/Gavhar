# Gavhar

"Gavhar" to'yxonasi va "Gavhar Studio" uchun ichki boshqaruv tizimi: bronlar, moliya, menyu, ombor, foto/video studio, xodimlar.

## Talablar

| Vosita         | Versiya |
| -------------- | ------- |
| Node.js        | 20+     |
| pnpm           | 12+     |
| Docker Compose | v2+     |
| ffmpeg         | 6+      |

## Ishga tushirish

```bash
pnpm install        # barcha bog'liqliklar
pnpm setup:env      # .env yaratadi, sirlarni tasodifiy generatsiya qiladi
pnpm infra:up       # PostgreSQL, Redis, MinIO (bucketlar avtomatik yaratiladi)
pnpm db:deploy      # migratsiyalarni qo'llash
pnpm db:seed        # ruxsatlar, tizim rollari, birinchi SUPER_ADMIN
pnpm dev            # backend + frontend
```

Birinchi SUPER_ADMIN'ning email va paroli `.env` dagi `SEED_SUPER_ADMIN_*` qiymatlaridan olinadi. Birinchi kirishda parolni almashtirish va 2FA ulash majburiy.

| Xizmat        | Manzil                         |
| ------------- | ------------------------------ |
| Frontend      | http://localhost:5180          |
| API           | http://localhost:4100/api/v1   |
| Swagger       | http://localhost:4100/api/docs |
| MinIO konsoli | http://localhost:9011          |
| PostgreSQL    | `localhost:5440`               |
| Redis         | `localhost:6380`               |

Portlar standartdan farq qiladi — boshqa loyihalar bilan to'qnashmasligi uchun. Hammasi `.env` orqali o'zgartiriladi.

## Buyruqlar

| Buyruq            | Vazifasi                                     |
| ----------------- | -------------------------------------------- |
| `pnpm dev`        | Backend va frontend'ni kuzatuv rejimida      |
| `pnpm build`      | Production build                             |
| `pnpm lint`       | ESLint                                       |
| `pnpm typecheck`  | TypeScript tekshiruvi                        |
| `pnpm test`       | Unit testlar (backend Jest, frontend Vitest) |
| `pnpm format`     | Prettier                                     |
| `pnpm infra:up`   | Docker xizmatlarini ko'tarish                |
| `pnpm infra:down` | Docker xizmatlarini to'xtatish               |

Ma'lumotlar bazasi: `pnpm db:migrate` (yangi migratsiya), `pnpm db:deploy`, `pnpm db:seed`, `pnpm db:studio`.

Parolni tiklash: SUPER_ADMIN har qanday xodimga «Foydalanuvchilar» bo'limidan yangi vaqtinchalik parol beradi. Yagona SUPER_ADMIN'ning o'zi parolini unutsa, serverda `pnpm user:reset-password <email>` ishlatiladi (`--reset-2fa` — telefon yo'qolgan bo'lsa ikki bosqichli himoyani ham o'chiradi). Buyruq vaqtinchalik parolni bir marta ko'rsatadi, eski sessiyalarni yopadi, blokni olib tashlaydi va audit jurnaliga yozadi.

E2E testlar: `pnpm test:e2e`. Ular haqiqiy PostgreSQL va Redis'da, lekin alohida bazada (`gavhar_test`, Redis DB 1) ishlaydi — dev ma'lumotlariga tegmaydi.

### Docker tarmog'i ishlamasa

Ba'zi Linux mashinalarda Docker'ning port-forward'i (`localhost:5440` kabi) javob bermaydi. Bunday holda:

- Konteynerlar qat'iy manzilga ega: PostgreSQL `172.30.40.10:5432`, Redis `172.30.40.11:6379`, MinIO `172.30.40.12:9000`. `.env` dagi `DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT` ni shu manzillarga o'zgartiring.
- Redis image'i tortilmasa, `pnpm redis:local` hostdagi `redis-server` ni Gavhar porti va paroli bilan alohida ishga tushiradi.

## Muhit o'zgaruvchilari

Yagona `.env` monorepo ildizida turadi; backend, frontend (Vite) va docker-compose shuni o'qiydi. Backend ishga tushishda barcha qiymatlarni Zod bilan tekshiradi — noto'g'ri yoki yetishmayotgan qiymat bo'lsa, sababini ko'rsatib to'xtaydi (qiymatning o'zi logga chiqmaydi).

| O'zgaruvchi                                 | Tavsif                                                    |
| ------------------------------------------- | --------------------------------------------------------- |
| `NODE_ENV`                                  | `development` / `test` / `production`                     |
| `TZ`                                        | Vaqt zonasi, standart `Asia/Tashkent`                     |
| `LOG_LEVEL`                                 | Pino log darajasi                                         |
| `API_PORT`, `WEB_PORT`                      | Backend va frontend portlari                              |
| `APP_URL`                                   | Frontend manzili. CORS faqat shu origin'ga ruxsat beradi  |
| `SWAGGER_ENABLED`                           | `/api/docs` ni yoqish                                     |
| `VITE_API_URL`                              | Frontend uchun API manzili (`/api/v1` yoki to'liq URL)    |
| `POSTGRES_*`, `DATABASE_URL`                | PostgreSQL                                                |
| `REDIS_PASSWORD`, `REDIS_PORT`, `REDIS_URL` | Redis                                                     |
| `JWT_ACCESS_SECRET`                         | Access token siri, kamida 32 belgi                        |
| `JWT_ACCESS_TTL_MINUTES`                    | Access token muddati, standart 15                         |
| `REFRESH_TOKEN_TTL_DAYS`                    | Refresh token muddati, standart 7                         |
| `PASSWORD_PEPPER`                           | Parol hash'iga qo'shiladigan server siri, kamida 32 belgi |
| `ENCRYPTION_KEY`                            | AES-256-GCM kaliti, 64 ta hex belgi                       |
| `COOKIE_SECURE`                             | Cookie faqat HTTPS orqali                                 |
| `SUPER_ADMIN_2FA_REQUIRED`                  | SUPER_ADMIN uchun 2FA majburiymi (standart `true`)        |
| `S3_*`, `MINIO_*`                           | MinIO / S3 ulanishi va bucket nomlari                     |
| `SEED_SUPER_ADMIN_*`                        | Birinchi SUPER_ADMIN hisobi                               |

Production'da qo'shimcha talablar tekshiriladi: `COOKIE_SECURE=true`, `APP_URL` https bo'lishi, pepper va JWT siri bir xil bo'lmasligi.

> `PASSWORD_PEPPER` va `ENCRYPTION_KEY` yo'qolsa yoki o'zgarsa, barcha parollar va 2FA sirlari yaroqsiz bo'ladi. Ularni xavfsiz joyda zaxiralang.

## Arxitektura

```
Brauzer (React SPA)
   │  REST /api/v1
   ├──────────────► NestJS API ──► PostgreSQL 16 (Prisma)
   │                    ├────────► Redis (rate-limit, cache, BullMQ)
   │                    └────────► MinIO (presigned URL)
   │  S3 multipart (to'g'ridan-to'g'ri)
   └──────────────────────────────► MinIO ◄── Worker (sharp, ffmpeg)
```

```
gavhar/
├── backend/                 NestJS + TypeScript
│   ├── src/
│   │   ├── config/          env validatsiya, tiplangan konfiguratsiya
│   │   ├── common/          dekorator, guard, filter, interceptor, DTO
│   │   ├── infrastructure/  prisma, redis, storage, queue
│   │   └── modules/         biznes modullar
│   └── test/                e2e testlar
├── frontend/                React + Vite + TailwindCSS
│   └── src/
│       ├── app/             provider, router (guard'lar), global uslublar
│       ├── components/      ui, layout, shared
│       ├── features/        har bir modul: api, components, pages, schemas, types
│       ├── hooks/           umumiy hook'lar
│       ├── i18n/            uz.json, ru.json
│       ├── lib/             env, API klient, sessiya, formatlash
│       └── stores/          Zustand: auth, tema, til, UI
├── scripts/                 yordamchi skriptlar
└── docker-compose.yml       PostgreSQL, Redis, MinIO
```

### API javob formati

Muvaffaqiyatli:

```json
{ "success": true, "data": {}, "meta": { "page": 1, "limit": 20, "total": 45, "totalPages": 3 } }
```

Xato:

```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [] },
  "requestId": "…",
  "path": "/api/v1/…",
  "timestamp": "…"
}
```

Har bir javobda `X-Request-Id` sarlavhasi bor — loglardan so'rovni topish uchun.

## Frontend

| Mavzu         | Qayerda va qanday                                                                                                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dizayn tizimi | Ranglar, shriftlar va soyalar `src/app/styles/globals.css` dagi tokenlarda (zumrad `#0F4C3A`, oltin `#C9A24B`, fil suyagi `#FAF7F0`). Komponentlarda hex yozilmaydi          |
| Mavzu         | Yorug‘ / tungi / tizim bo‘yicha. `public/theme-init.js` sahifa chizilishidan oldin qo‘yadi — chaqnash bo‘lmaydi                                                              |
| Komponentlar  | `components/ui` — shadcn uslubidagi Radix asosli komponentlar; `components/shared` — DataTable, PageHeader, ConfirmDialog, EmptyState                                        |
| Sessiya       | Access token faqat xotirada. Ilova ochilganda cookie'dagi refresh token bilan tiklanadi; 401 da bir marta yangilab qayta uriniladi (`lib/auth-session.ts`, `lib/api-client`) |
| Ko‘p tab      | Refresh so‘rovlari Web Locks orqali navbatga qo‘yiladi (aks holda rotation tokenni "o‘g‘irlangan" deb hisoblardi); chiqish barcha tablarga tarqaladi                         |
| Routing       | `app/router/guards.tsx`: kirmagan → login; parol almashtirilmagan yoki 2FA ulanmagan → majburiy sozlash; ruxsati yo‘q → 403                                                  |
| Ruxsatlar     | Menyu bandlari `components/layout/nav.ts` da `visible(user)` orqali; tugmalar uchun `usePermissions().can(...)`                                                              |
| Tillar        | O‘zbek (asosiy) va rus. Xato xabarlari server kodi bo‘yicha tarjima qilinadi (`errors.codes.*`). Test ikkala lug‘at to‘liq va bir xil ekanini tekshiradi                     |
| Vaqt          | Hamma joyda `Asia/Tashkent` bo‘yicha ko‘rsatiladi (`lib/format.ts`)                                                                                                          |

Yangi modul qo‘shish: `features/<nom>/` papkasi, `app/router/index.tsx` ga route, `components/layout/nav.ts` ga menyu bandi, ikkala lug‘atga tarjimalar.

## Bronlar: asosiy qoidalar

| Mavzu         | Qoida                                                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Summa         | `mehmonlar × 1 kishilik narx + qo'shimcha xizmatlar − chegirma`. Zal uchun alohida haq olinmaydi — u kishi boshiga narx ichida. Har doim serverda, `Decimal` bilan hisoblanadi |
| Narxlar       | 1 kishilik narx va xizmat narxi bron paytidagi holatida saqlanadi — keyin paket yoki katalogda o'zgarsa ham eski bron summasi o'zgarmaydi                                      |
| Xizmatlar     | Katalogdagi har bir xizmat "bir tadbir uchun" yoki "bir mehmon uchun" hisoblanadi                                                                                              |
| Zal bandligi  | Bir zalda bir vaqtda ikki bron bo'lmasligi PostgreSQL `EXCLUDE` cheklovi bilan kafolatlanadi (parallel so'rovlarda ham). Bekor qilingan bron vaqtni bo'shatadi                 |
| Stol va ovqat | Stol turi (10 yoki 12 kishilik) va kelin-kuyov tanlagan 1-/2-ovqat bronda saqlanadi; ovqatni faqat SUPER_ADMIN belgilaydi. Oshpaz bozorlikni shunga qarab yozadi               |
| Holatlar      | So'rov → Tasdiqlangan → O'tkazildi → Yakunlandi; So'rov va Tasdiqlangan holatdan bekor qilish mumkin                                                                           |
| Zaklad        | Tasdiqlash uchun minimal zaklad to'langan bo'lishi shart. Foiz Bronlar sahifasidagi sozlamada (standart 20%)                                                                   |
| Yakunlash     | Faqat qarz to'liq yopilgach                                                                                                                                                    |
| To'lovlar     | Naqd / karta / o'tkazma; so'm yoki dollar (kurs va so'mdagi qiymat har to'lovda saqlanadi). To'lov o'chirilmaydi — bekor qilinadi va tarixda qoladi                            |
| Hujjatlar     | Shartnoma va to'lov kvitansiyasi PDF ko'rinishida serverda yaratiladi                                                                                                          |

Bron ochadigan rolga `events:*` bilan birga `clients:read` va `halls:read`, to'lov qabul qiladigan rolga `finance:create` ruxsati kerak.

**Pul faqat `finance:read` ruxsati borlarga ko'rinadi.** Bu ruxsati yo'q xodimga (standart Admin, Zavzal, Oshpaz) bron ro'yxati, bron sahifasi va bosh sahifada narx, summa, to'lov va qarz umuman yuborilmaydi (server javobidan olib tashlanadi); shartnoma va kvitansiya PDF'i ham ochilmaydi. Bunday xodim bron ochganda narxni qo'lda kirita olmaydi — menyu paketini tanlashi shart, 1 kishilik narx paketdan olinadi.

## Ishchilar

| Mavzu     | Qoida                                                                                                                                                                   |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ro'yxat   | Ofitsiant (yigit/qiz), oshpaz va boshqa ishchilar: ism, telefon (takrorlanmaydi), lavozim, rasm, izoh (`/workers`). Ular tizimga kirmaydi — bu faqat ro'yxat            |
| To'yga    | Bron sahifasidagi «Ishchilar» kartasida faol ishchilar to'yga biriktiriladi, xohlasa shu to'ydagi vazifasi yoziladi. Bitta ishchi bir to'yga ikki marta biriktirilmaydi |
| Faol emas | Ishlamay qo'ygan ishchi «faol emas» qilinadi: yangi to'ylarga biriktirilmaydi, o'tgan to'ylardagi yozuvlari saqlanadi                                                   |
| Zavzal    | Tizim roli (`ZAVZAL`): bosh sahifa, bronlar (pulsiz), zallar va ishchilarni ko'radi, ishchi qo'shadi va to'yga biriktiradi                                              |
| Ruxsatlar | `staff:read/create/update/delete`                                                                                                                                       |

## Bosh sahifa

`dashboard:read` ruxsati borlarga: bugungi va ertangi to'ylar kartasi (vaqt, zal, mehmonlar, paket, biriktirilgan ishchilar, bozorlik ro'yxatlari soni), shu hafta kunlari bo'yicha, oldindagi bronlar soni va kam qolgan ombor mahsulotlari. `finance:read` borlarga qo'shimcha — shu oy bo'yicha kutilayotgan summa, olingan pul, qarz, xarajat va sof foyda hamda to'y kartasida qarz. Kutilayotgan bozorlik ishlari (tekshirish, xarid, tasdiqlash) tepadagi qo'ng'iroqchada ko'rinadi.

## Menyu, galereya va taqdimot

| Mavzu          | Qoida                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Menyu paketi   | Nom, 1 kishilik narx, ixtiyoriy belgi (masalan "VIP") va tarkib: qaysi bo'limdan necha xil, xohlasa aniq taom nomlari. Paketlar soni cheklanmagan (`/menu`)                                                                                                                                                                                                                                                                  |
| Bo'limlar      | Barcha paketlar uchun umumiy ro'yxat (salatlar, suyuq taomlar…), ikki tilda nomlanadi, tartibi o'zgartiriladi                                                                                                                                                                                                                                                                                                                |
| Narx tarixi    | Paket narxi o'zgarganda eski narx tarixda qoladi (`menu_package_prices`)                                                                                                                                                                                                                                                                                                                                                     |
| Bron bilan     | Bronda paket tanlansa 1 kishilik narx avtomatik qo'yiladi (qo'lda o'zgartirsa bo'ladi). Bronda paket nomi va narxi o'sha paytdagi holatida saqlanadi                                                                                                                                                                                                                                                                         |
| Galereya       | Albomlar (umumiy zal, stol bezatilishi, kortej…) ichida rasm va video (`/gallery`). Rasm WebP'ga o'giriladi, EXIF olib tashlanadi. Albomlar taqdimotda paket sahifasi ichida ko'rinadi: albom bitta paketga biriktirilsa — faqat o'sha paketda, biriktirilmasa — hamma paketda. Paket o'chirilsa, uning albomlari umumiy bo'lib qoladi                                                                                       |
| Taomlar        | Paketlarda yozilgan har bir taomga rasm va qisqa tavsif beriladi (Menyu → «Taomlar»). Rasmlar taqdimotda paket ostida ko'rinadi; taom nomi katta-kichik harfga qaramaydi                                                                                                                                                                                                                                                     |
| Video          | Brauzer faylni to'g'ridan-to'g'ri saqlash joyiga yuklaydi (2 GB gacha, MP4/MOV/WebM); server fayl mazmunini tekshiradi, `ffmpeg` bilan muqova va davomiylikni oladi                                                                                                                                                                                                                                                          |
| Video sifati   | Yuklangan video fonda, navbat bilan tayyorlanadi: ideal bo'lsa tegilmaydi, indeksi oxirida bo'lsa qayta o'raladi, boshqa kodek / 1080p dan katta / juda og'ir bo'lsa H.264+AAC MP4 (1080p, 8 Mbit/s gacha) ga o'giriladi. Shu paytda ham asl fayl o'ynaydi. Muvaffaqiyatsiz bo'lsa fayl yuklangan holicha qoladi va galereyada «qayta urinish» tugmasi chiqadi; server o'chib-yonsa chala ishlar qaytadan navbatga qo'yiladi |
| Brend          | To'yxona nomi va logotipi (Profil → «Brend», faqat SUPER_ADMIN): kirish sahifasi, yon menyu va taqdimotda ko'rinadi. Logotip bo'lmasa aylanayotgan gavhar turadi                                                                                                                                                                                                                                                             |
| Taqdimot       | `/showcase` — mijozga ko'rsatiladigan to'liq ekranli sahifa: faol zallar va menyu paketlari. Boshqaruv tugmalari yo'q, tilni o'zgartirish mumkin; televizor va katta monitorda hamma narsa ekranga mos kattalashadi                                                                                                                                                                                                          |
| Paket kartasi  | Taqdimotda har bir paket — muqova rasmli baland karta: nom, 1 kishilik narx va tanlangan mehmonlar soni uchun jami summa. Mehmonlar soni tepada bir marta o'zgartiriladi (− / +, 200–500 tez tanlash) va hamma joyda shunga qarab hisoblanadi                                                                                                                                                                                |
| Paket sahifasi | Kartani bosganda `/showcase/menu/:id` ochiladi: to'liq ekranli muqova va narx, restoran menyusi ko'rinishidagi varaq (bo'limlar, taom rasmi va tavsifi), taomlar rasmlari, galereya va boshqa paketlar                                                                                                                                                                                                                       |
| Muqova         | Paket muqovasi Menyu → «Paketlar»da kartaning tepasida yuklanadi (`menu:update`). Muqova bo'lmasa paketdagi birinchi rasmli taom, u ham bo'lmasa zumrad fon va gavhar ko'rsatiladi                                                                                                                                                                                                                                           |
| Boshlang'ich   | `pnpm db:seed` bo'sh bazaga 11 ta bo'lim, 3 ta paket (160 / 200 / 280 ming) va 5 ta albom qo'shadi; mavjud ma'lumotga tegmaydi                                                                                                                                                                                                                                                                                               |
| Ruxsatlar      | Menyu — `menu:read/create/update/delete`; galereya — `media:read/upload/delete`. Taqdimot shu ruxsatlardan (va `halls:read`) borlarini ko'rsatadi                                                                                                                                                                                                                                                                            |

Serverda `ffmpeg` va `ffprobe` o'rnatilgan bo'lishi kerak — bo'lmasa videolar qayta ishlanmay, yuklangan holicha saqlanadi. Video yuklash uchun MinIO'da CORS `APP_URL` ga ochiq bo'lishi kerak (`docker-compose.yml` dagi `MINIO_API_CORS_ALLOW_ORIGIN`). Frontend manzili o'zgarsa, MinIO'ni qayta ishga tushiring.

## Hisob-kitob va ombor

| Mavzu              | Qoida                                                                                                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Asosiy qoida       | Faqat bo'lib o'tgan narsa hisoblanadi. Kelajakdagi bron bekor bo'lishi mumkin, shuning uchun uning zakladi tushumga qo'shilmaydi                                                                                       |
| Tushum             | Kuni kelgan tadbirlar uchun olingan pul; tadbir kuniga yoziladi. Kalendar kuni bo'yicha: bugun kechqurungi to'y bugun boshlanishi bilan hisobga kiradi. Zaklad oldinroq olingan bo'lsa ham, to'y kuni tushumga kiradi  |
| Bekor qilingan     | Bekor qilingan to'ydan qaytarilmay qolgan zaklad ham haqiqiy pul — u o'sha to'y kuniga yoziladi (kuni kelgach)                                                                                                         |
| Xarajat            | Tur, summa, sana va izoh. Kelajak sanasi qabul qilinmaydi. Turlarni faqat `finance:manage-categories` ruxsati bor foydalanuvchi boshqaradi. Bozorlik faqat SUPER_ADMIN tasdiqlagach xarajatga aylanadi                 |
| To'y xarajati      | Xarajat to'yga bog'lanishi mumkin (kamerachi, san'atkor, kortej, oshpazga to'lov, bozorlik…). U to'y kuniga yoziladi, to'y ko'chsa birga ko'chadi va shu to'yning sof foydasidan ayiriladi (`GET /finance/events/:id`) |
| Sof foyda          | Tushum − xarajatlar. Qarzdorlik (o'tgan to'ylardan olinmagan pul) alohida ko'rsatiladi                                                                                                                                 |
| Davr               | Hafta (dushanba–yakshanba), oy yoki yil; hafta va oy — kunlar, yil — oylar bo'yicha grafik. Hisob Toshkent vaqti bo'yicha, davr kelajakda tugasa ham shu lahzada to'xtaydi                                             |
| Kelajakdagilar     | Hali bo'lmagan to'ylar soni, shartnoma summasi va olingan zaklad alohida blokda — ma'lumot uchun                                                                                                                       |
| Ombor              | Ikki bo'lim: idish-tovoq va oziq-ovqat. Qoldiq faqat kirim/chiqim orqali o'zgaradi; harakatlar o'zgartirilmaydi va o'chirilmaydi (xato teskari harakat bilan tuzatiladi)                                               |
| Chiqim             | Qoldiqdan ko'p chiqarib bo'lmaydi — qator qulflanadi, bir vaqtda kelgan so'rovlarda ham. Donalab sanaladigan birlikda kasr qabul qilinmaydi                                                                            |
| Xarid summasi      | Kirimda summa kiritilsa, u faqat ombor tarixida saqlanadi — ombor xaridlari hisob-kitobga qo'shilmaydi                                                                                                                 |
| Kam qoldi          | Mahsulotga chegara qo'yilsa, qoldiq shu miqdorga tushganda belgilanadi va bosh sahifada ko'rinadi                                                                                                                      |
| Mahsulot turi      | Oziq-ovqat mahsulotiga tur (sabzavot, go'sht, don…) va har qanday mahsulotga rasm qo'yiladi. Qoldiq nol bo'lmaguncha o'lchov birligini o'zgartirib bo'lmaydi                                                           |
| Inventarizatsiya   | Sanab chiqilgan haqiqiy miqdor kiritiladi — farq (ortiqcha yoki kamomad) avtomatik kirim/chiqim bo'lib tarixga yoziladi                                                                                                |
| So'nggi harakatlar | Butun ombor bo'yicha oxirgi kirim-chiqimlar bitta ro'yxatda. Oziq-ovqat bo'limi oshpazga bozorlik yozishda mahsulot nomi taklifi sifatida chiqadi                                                                      |

Ruxsatlar: hisob-kitob — `finance:read/create/update/delete`, ombor — `warehouse:read/create/update/delete` (kirim/chiqim — `warehouse:update`).

## Bozorlik

To'y kuni qilinadigan xarid. Oqim to'rt qadamdan iborat va har bir qadamni o'z roli bajaradi:

| Qadam | Kim                         | Nima qiladi                                                                                                    | Holat            |
| ----- | --------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------- |
| 1     | Oshpaz (`shopping:create`)  | To'yni tanlaydi, menyu tarkibiga qarab mahsulot, miqdor va birlikni yozadi                                     | Tekshiruvda      |
| 2     | SUPER_ADMIN                 | Ro'yxatni ko'radi: kamaytiradi, qo'shadi, olib tashlaydi (oshpaz so'ragan miqdor saqlanib, farqi ko'rsatiladi) | Xarid kutilmoqda |
| 3     | Admin (`shopping:purchase`) | Sotib oladi, har bir qatorga to'langan summani kiritadi yoki "olinmadi" deb belgilaydi. Oraliq saqlash mumkin  | Sotib olingan    |
| 4     | SUPER_ADMIN                 | Tasdiqlaydi — shundan keyingina summa «Bozorlik» turidagi xarajatga yoziladi va sof foydadan ayiriladi         | Tasdiqlangan     |

- Ro'yxatni yozilishi bilan faqat SUPER_ADMIN ko'radi; oshpaz o'zinikini, xaridchi (admin) esa SUPER_ADMIN yuborganlarini ko'radi.
- Bir xil mahsulot ikki marta yozilsa, bitta qatorga qo'shiladi. Bozorlik qilib bo'lingan to'yga yangi ro'yxat yozilmaydi.
- Narxlar to'y kunidan oldin kiritilmaydi (bozorlik shu kuni qilinadi); xarajat to'y kuniga yoziladi.
- Tasdiqlangan bozorlik xarajati «Hisob-kitob»da o'zgartirilmaydi: SUPER_ADMIN Bozorlik bo'limida tasdiqni bekor qiladi, narxni tuzatadi va qayta tasdiqlaydi.
- Tasdiqlanmagan (sotib olingan) bozorlik summasi «Hisob-kitob» sahifasida alohida ogohlantirish bo'lib turadi.
- Oshpaz — tizim roli (`COOK`): faqat Bozorlik bo'limini ko'radi. Tadbirlar unga pulsiz va mijoz telefonisiz ko'rsatiladi; bronlar, moliya, ombor va boshqa bo'limlarga kira olmaydi. Hisobni SUPER_ADMIN «Foydalanuvchilar» bo'limida «Oshpaz» roli bilan ochadi.
- Har bir ro'yxat PDF qilib yuklab olinadi (bozorga olib borish yoki hisobot uchun).
- «Umumiy» bo'limida to'yga bog'lanmagan ro'yxat yoziladi (tuz, salfetka, yuvish vositalari…); u ham xuddi shu to'rt qadamdan o'tadi va tasdiqlangach umumiy xarajatga yoziladi.
- Har bir qatorga izoh yozish mumkin («qizil va yirik bo'lsin»). Narx jami summa yoki 1 birlik narxi ko'rinishida kiritiladi — ikkinchisida jami avtomatik hisoblanadi.

## Xavfsizlik

| Mavzu              | Yechim                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Parollar           | argon2id (64 MiB, 3 iteratsiya) + pepper (argon2 `secret` sifatida, bazada saqlanmaydi). Siyosat: 12+ belgi, katta/kichik harf, raqam, belgi |
| Access token       | JWT HS256, 15 daqiqa, faqat `Authorization` sarlavhasida. Ichida foydalanuvchi va sessiya ID                                                 |
| Refresh token      | 7 kun, `httpOnly` + `SameSite=Strict` cookie (`/api/v1/auth`), bazada faqat SHA-256 hash                                                     |
| Rotation           | Har refreshda yangi token. Ishlatilgan token qayta kelsa — foydalanuvchining barcha sessiyalari bekor qilinadi                               |
| Sessiyani bekor    | Redis'dagi qora ro'yxat orqali darhol kuchga kiradi (15 daqiqa kutilmaydi)                                                                   |
| Brute-force        | IP bo'yicha rate-limit + hisob bo'yicha bloklash: 5 xatodan keyin 1 → 5 → 15 → 60 daqiqa                                                     |
| 2FA                | TOTP, sir AES-256-GCM bilan shifrlangan, 10 ta bir martalik zaxira kod (hash holida). SUPER_ADMIN uchun majburiy. Kod qayta ishlatilmaydi    |
| CSRF               | Cookie ishlatadigan endpointlar (refresh, logout) uchun double-submit token (`X-CSRF-Token`)                                                 |
| RBAC               | `resource:action` ruxsatlar, `@Permissions()` + global guard. Foydalanuvchi, rol va audit boshqaruvi faqat SUPER_ADMIN'da, rolga berilmaydi  |
| Oxirgi SUPER_ADMIN | O'chirib, bloklab yoki pasaytirib bo'lmaydi (Serializable tranzaksiyada tekshiriladi)                                                        |
| Audit log          | Kim, qachon, qaysi IP va qurilmadan, oldingi va yangi qiymat. Parol, token va sirlar avtomatik yashiriladi                                   |
| Validatsiya        | Barcha DTO'lar `whitelist` + `forbidNonWhitelisted`                                                                                          |

Production'da frontend va API bir xil "site"da bo'lishi kerak (masalan `admin.gavhar.uz` va `api.gavhar.uz`) — aks holda `SameSite=Strict` cookie yuborilmaydi.

## Commit qoidalari

[Conventional Commits](https://www.conventionalcommits.org/): `feat(backend): …`, `fix(frontend): …`. Husky commit'dan oldin lint-staged (ESLint + Prettier) va commitlint'ni ishga tushiradi.
