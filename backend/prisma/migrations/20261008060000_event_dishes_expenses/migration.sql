-- AlterTable
ALTER TABLE "events" ADD COLUMN     "first_dish" TEXT,
ADD COLUMN     "second_dish" TEXT,
ADD COLUMN     "table_capacity" INTEGER;

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "event_id" UUID;

-- CreateIndex
CREATE INDEX "expenses_event_id_idx" ON "expenses"("event_id");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Stol turi faqat 10 yoki 12 kishilik bo'ladi.
ALTER TABLE "events" ADD CONSTRAINT "events_table_capacity_check"
  CHECK ("table_capacity" IS NULL OR "table_capacity" IN (10, 12));

-- Tasdiqlangan bozorlikdan yozilgan xarajatlar o'z to'yiga bog'lanadi.
UPDATE "expenses" e SET "event_id" = l."event_id"
FROM "shopping_lists" l WHERE e."shopping_list_id" = l."id";
