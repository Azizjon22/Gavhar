-- AlterTable
ALTER TABLE "shopping_items" ADD COLUMN     "note" TEXT;

-- AlterTable
ALTER TABLE "shopping_lists" ALTER COLUMN "event_id" DROP NOT NULL;

