-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('VEGETABLE', 'FRUIT', 'MEAT', 'DAIRY', 'GREENS', 'GRAIN', 'OIL', 'SPICE', 'DRINK', 'OTHER');

-- AlterTable
ALTER TABLE "warehouse_items" ADD COLUMN     "photo_key" TEXT,
ADD COLUMN     "photo_thumb_key" TEXT,
ADD COLUMN     "product_category" "ProductCategory";

