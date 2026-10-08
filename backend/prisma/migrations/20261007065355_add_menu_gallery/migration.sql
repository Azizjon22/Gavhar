-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO');

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "menu_package_id" UUID,
ADD COLUMN     "menu_package_name" TEXT;

-- CreateTable
CREATE TABLE "menu_categories" (
    "id" UUID NOT NULL,
    "name_uz" TEXT NOT NULL,
    "name_ru" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_packages" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price_per_guest" DECIMAL(18,2) NOT NULL,
    "badge" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "menu_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_package_sections" (
    "id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "kinds_count" INTEGER NOT NULL DEFAULT 1,
    "items" TEXT[],

    CONSTRAINT "menu_package_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_package_prices" (
    "id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "price" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_package_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gallery_albums" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "gallery_albums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gallery_items" (
    "id" UUID NOT NULL,
    "album_id" UUID NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "object_key" TEXT NOT NULL,
    "thumb_key" TEXT,
    "mime_type" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "size_bytes" BIGINT NOT NULL,
    "duration_sec" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gallery_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "menu_package_sections_package_id_category_id_key" ON "menu_package_sections"("package_id", "category_id");

-- CreateIndex
CREATE INDEX "menu_package_prices_package_id_created_at_idx" ON "menu_package_prices"("package_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "gallery_items_object_key_key" ON "gallery_items"("object_key");

-- CreateIndex
CREATE INDEX "gallery_items_album_id_created_at_idx" ON "gallery_items"("album_id", "created_at");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_menu_package_id_fkey" FOREIGN KEY ("menu_package_id") REFERENCES "menu_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_package_sections" ADD CONSTRAINT "menu_package_sections_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "menu_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_package_sections" ADD CONSTRAINT "menu_package_sections_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "menu_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_package_prices" ADD CONSTRAINT "menu_package_prices_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "menu_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "gallery_albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;
