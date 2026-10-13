-- Shodiyora narx qoidasi: menyu paketi — belgilangan mehmonlar soni uchun qat'iy narx.
-- To'y narxi paketdan olinadi; 1 kishilik narx, qo'shimcha xizmatlar, chegirma va
-- dollar bilan to'lov olib tashlanadi.

-- ── Menyu paketlari ──────────────────────────────────────────────────────────
CREATE TYPE "MenuPackageType" AS ENUM ('FULL', 'FOOD_ONLY');

ALTER TABLE "menu_packages"
  ADD COLUMN "guest_count" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "package_type" "MenuPackageType" NOT NULL DEFAULT 'FOOD_ONLY';
ALTER TABLE "menu_packages" RENAME COLUMN "price_per_guest" TO "price";
-- Eski 1 kishilik narx 100 mehmonlik paket narxiga aylantiriladi (tarixi ham).
UPDATE "menu_packages" SET "price" = "price" * "guest_count";
UPDATE "menu_package_prices" SET "price" = "price" * 100;

-- ── Bronlar ──────────────────────────────────────────────────────────────────
-- "O'tkazildi" holati yo'q: to'y kuni kelgach u yakunlangan hisoblanadi.
UPDATE "events" SET "status" = 'COMPLETED' WHERE "status" = 'HELD';

ALTER TABLE "events" DROP CONSTRAINT "events_hall_time_excl";
ALTER TYPE "EventStatus" RENAME TO "EventStatus_old";
CREATE TYPE "EventStatus" AS ENUM ('REQUEST', 'CONFIRMED', 'COMPLETED', 'CANCELLED');
ALTER TABLE "events" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "events" ALTER COLUMN "status" TYPE "EventStatus" USING ("status"::text::"EventStatus");
ALTER TABLE "events" ALTER COLUMN "status" SET DEFAULT 'REQUEST';
DROP TYPE "EventStatus_old";
ALTER TABLE "events"
  ADD CONSTRAINT "events_hall_time_excl"
  EXCLUDE USING gist (
    "hall_id" WITH =,
    tstzrange("start_at", "end_at", '[)') WITH &&
  )
  WHERE ("status" <> 'CANCELLED' AND "deleted_at" IS NULL);

ALTER TABLE "events"
  DROP COLUMN "price_per_guest",
  DROP COLUMN "extras_total",
  DROP COLUMN "discount";

DROP TABLE "event_services";
DROP TABLE "extra_services";
DROP TYPE "ExtraServiceUnit";

-- ── To'lovlar ────────────────────────────────────────────────────────────────
-- Zaklad — oddiy to'lov; hammasi so'mda.
UPDATE "payments" SET "kind" = 'PAYMENT' WHERE "kind" = 'DEPOSIT';
ALTER TYPE "PaymentKind" RENAME TO "PaymentKind_old";
CREATE TYPE "PaymentKind" AS ENUM ('PAYMENT', 'REFUND');
ALTER TABLE "payments" ALTER COLUMN "kind" TYPE "PaymentKind" USING ("kind"::text::"PaymentKind");
DROP TYPE "PaymentKind_old";

UPDATE "payments" SET "amount" = "amount_uzs";
ALTER TABLE "payments"
  DROP COLUMN "currency",
  DROP COLUMN "exchange_rate",
  DROP COLUMN "amount_uzs";
DROP TYPE "Currency";

-- Zaklad foizi sozlamasi endi kerak emas: to'liq to'langan to'y o'zi tasdiqlanadi.
DELETE FROM "settings" WHERE "key" = 'booking.minDepositPercent';
