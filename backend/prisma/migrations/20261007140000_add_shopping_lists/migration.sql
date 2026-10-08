-- Ombor xaridlari hisob-kitobdan ajratildi: ilgari ombor kirimidan avtomatik yozilgan
-- xarajatlar olib tashlanadi, ularning kategoriyalari oddiy kategoriyaga aylanadi.
UPDATE "expenses" SET "deleted_at" = now() WHERE "stock_movement_id" IS NOT NULL AND "deleted_at" IS NULL;
UPDATE "expense_categories" SET "code" = NULL WHERE "code" LIKE 'WAREHOUSE_%';

-- CreateEnum
CREATE TYPE "ShoppingListStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'PURCHASED', 'CONFIRMED');

-- DropForeignKey
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_stock_movement_id_fkey";

-- DropIndex
DROP INDEX "expenses_stock_movement_id_key";

-- AlterTable
ALTER TABLE "expenses" DROP COLUMN "stock_movement_id",
ADD COLUMN     "shopping_list_id" UUID;

-- CreateTable
CREATE TABLE "shopping_lists" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "status" "ShoppingListStatus" NOT NULL DEFAULT 'SUBMITTED',
    "note" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_by_name" TEXT NOT NULL,
    "approved_at" TIMESTAMPTZ(3),
    "purchased_at" TIMESTAMPTZ(3),
    "purchased_by_name" TEXT,
    "confirmed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "shopping_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_items" (
    "id" UUID NOT NULL,
    "list_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "unit" "WarehouseUnit" NOT NULL,
    "requested_quantity" DECIMAL(14,3),
    "quantity" DECIMAL(14,3) NOT NULL,
    "price" DECIMAL(18,2),
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "shopping_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shopping_lists_event_id_deleted_at_idx" ON "shopping_lists"("event_id", "deleted_at");

-- CreateIndex
CREATE INDEX "shopping_lists_status_deleted_at_idx" ON "shopping_lists"("status", "deleted_at");

-- CreateIndex
CREATE INDEX "shopping_items_list_id_sort_order_idx" ON "shopping_items"("list_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_shopping_list_id_key" ON "expenses"("shopping_list_id");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_shopping_list_id_fkey" FOREIGN KEY ("shopping_list_id") REFERENCES "shopping_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "shopping_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Qiymatlar chegarasi baza darajasida ham kafolatlanadi.
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_values_check"
  CHECK ("quantity" > 0 AND ("requested_quantity" IS NULL OR "requested_quantity" > 0) AND ("price" IS NULL OR "price" > 0));
