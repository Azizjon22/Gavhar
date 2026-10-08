-- Zal uchun alohida haq olinmaydi: to'yxona narxi kishi boshiga narx ichida.
-- Avval ochilgan bronlar summasidan zal narxi ayiriladi, so'ng ustunlar olib tashlanadi.
UPDATE "events" SET "total_amount" = GREATEST("total_amount" - "hall_price", 0);

-- AlterTable
ALTER TABLE "events" DROP COLUMN "hall_price";

-- AlterTable
ALTER TABLE "halls" DROP COLUMN "price";
