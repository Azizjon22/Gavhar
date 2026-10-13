-- AlterEnum
ALTER TYPE "ShoppingListStatus" ADD VALUE 'REVIEWED' BEFORE 'APPROVED';

-- AlterTable
ALTER TABLE "shopping_items" ADD COLUMN     "purchased_at" TIMESTAMPTZ(3),
ADD COLUMN     "purchased_by_name" TEXT;

-- AlterTable
ALTER TABLE "shopping_lists" ADD COLUMN     "admin_seen_at" TIMESTAMPTZ(3),
ADD COLUMN     "reviewed_at" TIMESTAMPTZ(3),
ADD COLUMN     "telegram_messages" JSONB;

-- CreateTable
CREATE TABLE "warehouse_lots" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_price" DECIMAL(18,2),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_usages" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "taken_by_id" UUID NOT NULL,
    "taken_by_name" TEXT NOT NULL,
    "telegram_messages" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_usage_items" (
    "id" UUID NOT NULL,
    "usage_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "unit" "WarehouseUnit" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "total_cost" DECIMAL(18,2),
    "allocations" JSONB NOT NULL,

    CONSTRAINT "stock_usage_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "warehouse_lots_item_id_created_at_idx" ON "warehouse_lots"("item_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_usages_event_id_idx" ON "stock_usages"("event_id");

-- CreateIndex
CREATE INDEX "stock_usages_created_at_idx" ON "stock_usages"("created_at");

-- CreateIndex
CREATE INDEX "stock_usage_items_usage_id_idx" ON "stock_usage_items"("usage_id");

-- AddForeignKey
ALTER TABLE "warehouse_lots" ADD CONSTRAINT "warehouse_lots_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "warehouse_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_usages" ADD CONSTRAINT "stock_usages_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_usage_items" ADD CONSTRAINT "stock_usage_items_usage_id_fkey" FOREIGN KEY ("usage_id") REFERENCES "stock_usages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_usage_items" ADD CONSTRAINT "stock_usage_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "warehouse_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Mavjud qoldiq bitta partiya bo'lib ochiladi. Narxi — oxirgi narxli kirimdan (1 birlik),
-- bo'lmasa bo'sh (SUPER_ADMIN keyin kiritadi).
INSERT INTO "warehouse_lots" ("id", "item_id", "quantity", "unit_price", "created_at")
SELECT gen_random_uuid(), i."id", i."quantity",
       (SELECT round(m."total_cost" / m."quantity", 2)
          FROM "stock_movements" m
         WHERE m."item_id" = i."id" AND m."type" = 'IN' AND m."total_cost" IS NOT NULL AND m."quantity" > 0
         ORDER BY m."created_at" DESC LIMIT 1),
       i."updated_at"
FROM "warehouse_items" i
WHERE i."quantity" > 0;

-- Narxi kiritilgan qatorlar sotib olingan hisoblanadi.
UPDATE "shopping_items" si
SET "purchased_at" = coalesce(l."purchased_at", l."updated_at"), "purchased_by_name" = l."purchased_by_name"
FROM "shopping_lists" l
WHERE l."id" = si."list_id" AND si."price" IS NOT NULL;
