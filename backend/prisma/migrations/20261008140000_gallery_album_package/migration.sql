-- AlterTable
ALTER TABLE "gallery_albums" ADD COLUMN "menu_package_id" UUID;

-- CreateIndex
CREATE INDEX "gallery_albums_menu_package_id_idx" ON "gallery_albums"("menu_package_id");

-- AddForeignKey
ALTER TABLE "gallery_albums" ADD CONSTRAINT "gallery_albums_menu_package_id_fkey" FOREIGN KEY ("menu_package_id") REFERENCES "menu_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
