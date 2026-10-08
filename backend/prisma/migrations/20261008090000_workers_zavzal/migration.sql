-- CreateEnum
CREATE TYPE "WorkerPosition" AS ENUM ('WAITER_MALE', 'WAITER_FEMALE', 'CHEF', 'OTHER');

-- CreateTable
CREATE TABLE "workers" (
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "position" "WorkerPosition" NOT NULL,
    "note" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "photo_key" TEXT,
    "photo_thumb_key" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "workers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_workers" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "role_at_event" TEXT,
    "assigned_by_name" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_workers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workers_deleted_at_position_idx" ON "workers"("deleted_at", "position");

-- CreateIndex
CREATE INDEX "event_workers_worker_id_idx" ON "event_workers"("worker_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_workers_event_id_worker_id_key" ON "event_workers"("event_id", "worker_id");

-- AddForeignKey
ALTER TABLE "event_workers" ADD CONSTRAINT "event_workers_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_workers" ADD CONSTRAINT "event_workers_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Admin endi pulni ko'rmaydi: moliya ruxsatlari tizimning Admin rolidan olinadi.
-- SUPER_ADMIN keyin xohlasa, Rollar bo'limida qaytarib bera oladi.
DELETE FROM "role_permissions" rp
USING "roles" r, "permissions" p
WHERE rp."role_id" = r."id" AND rp."permission_id" = p."id"
  AND r."key" = 'ADMIN' AND p."key" LIKE 'finance:%';
