-- Oshpaz bozorlikni taom bosqichlari bo'yicha yozadi: salat, 1-ovqat, 2-ovqat, boshqa.
CREATE TYPE "MenuCourse" AS ENUM ('SALAD', 'FIRST_DISH', 'SECOND_DISH', 'OTHER');

ALTER TABLE "menu_categories" ADD COLUMN "course" "MenuCourse" NOT NULL DEFAULT 'OTHER';

-- Mavjud bo'limlar nomidan taxmin qilinadi; keyin menyu sahifasida o'zgartiriladi.
UPDATE "menu_categories" SET "course" = 'SALAD'
  WHERE "name_uz" ILIKE '%salat%' OR "name_ru" ILIKE '%салат%';
UPDATE "menu_categories" SET "course" = 'FIRST_DISH'
  WHERE "name_uz" ILIKE '%suyuq%' OR "name_uz" ILIKE '%sho''rva%' OR "name_ru" ILIKE '%перв%' OR "name_ru" ILIKE '%суп%';
UPDATE "menu_categories" SET "course" = 'SECOND_DISH'
  WHERE "name_uz" ILIKE '%quyuq%' OR "name_uz" ILIKE '%asosiy%' OR "name_ru" ILIKE '%втор%' OR "name_ru" ILIKE '%горяч%';
