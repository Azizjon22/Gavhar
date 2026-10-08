-- CreateEnum
CREATE TYPE "WarehouseSection" AS ENUM ('TABLEWARE', 'FOOD');

-- CreateEnum
CREATE TYPE "WarehouseUnit" AS ENUM ('PIECE', 'KG', 'LITER', 'PACK', 'BOX', 'SET');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('IN', 'OUT');

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "cancelled_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "spent_on" DATE NOT NULL,
    "note" TEXT,
    "stock_movement_id" UUID,
    "created_by_id" UUID,
    "created_by_name" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_items" (
    "id" UUID NOT NULL,
    "section" "WarehouseSection" NOT NULL,
    "name" TEXT NOT NULL,
    "unit" "WarehouseUnit" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "min_quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "warehouse_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "balance_after" DECIMAL(14,3) NOT NULL,
    "total_cost" DECIMAL(18,2),
    "note" TEXT,
    "created_by_id" UUID,
    "created_by_name" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_code_key" ON "expense_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_stock_movement_id_key" ON "expenses"("stock_movement_id");

-- CreateIndex
CREATE INDEX "expenses_spent_on_deleted_at_idx" ON "expenses"("spent_on", "deleted_at");

-- CreateIndex
CREATE INDEX "expenses_category_id_idx" ON "expenses"("category_id");

-- CreateIndex
CREATE INDEX "warehouse_items_section_deleted_at_idx" ON "warehouse_items"("section", "deleted_at");

-- CreateIndex
CREATE INDEX "stock_movements_item_id_created_at_idx" ON "stock_movements"("item_id", "created_at");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_stock_movement_id_fkey" FOREIGN KEY ("stock_movement_id") REFERENCES "stock_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "warehouse_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Avval bekor qilingan bronlar uchun bekor qilingan vaqt — oxirgi o'zgarish vaqti.
UPDATE "events" SET "cancelled_at" = "updated_at" WHERE "status" = 'CANCELLED';

-- Qiymatlar chegarasi baza darajasida ham kafolatlanadi.
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_amount_check" CHECK ("amount" > 0);
ALTER TABLE "warehouse_items" ADD CONSTRAINT "warehouse_items_quantity_check"
  CHECK ("quantity" >= 0 AND "min_quantity" >= 0);
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_quantity_check"
  CHECK ("quantity" > 0 AND "balance_after" >= 0 AND ("total_cost" IS NULL OR "total_cost" > 0));
