-- CreateTable
CREATE TABLE "dishes" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "photo_key" TEXT,
    "photo_thumb_key" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "dishes_pkey" PRIMARY KEY ("id")
);


-- Taom nomi harf kattaligidan qat'i nazar yagona.
CREATE UNIQUE INDEX "dishes_name_lower_key" ON "dishes" (lower("name"));
