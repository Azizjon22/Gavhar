-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('WEDDING', 'NIKOH', 'OSH', 'SUNNAT', 'BIRTHDAY', 'ANNIVERSARY', 'CORPORATE', 'OTHER');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('REQUEST', 'CONFIRMED', 'HELD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExtraServiceUnit" AS ENUM ('PER_EVENT', 'PER_GUEST');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('DEPOSIT', 'PAYMENT', 'REFUND');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'TRANSFER');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('UZS', 'USD');

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "client_id" UUID NOT NULL,
    "hall_id" UUID NOT NULL,
    "type" "EventType" NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'REQUEST',
    "title" TEXT,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "guest_count" INTEGER NOT NULL,
    "price_per_guest" DECIMAL(18,2) NOT NULL,
    "hall_price" DECIMAL(18,2) NOT NULL,
    "extras_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(18,2) NOT NULL,
    "paid_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extra_services" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(18,2) NOT NULL,
    "unit" "ExtraServiceUnit" NOT NULL DEFAULT 'PER_EVENT',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "extra_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_services" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "extra_service_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "unit" "ExtraServiceUnit" NOT NULL,
    "unit_price" DECIMAL(18,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "total" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "event_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'UZS',
    "amount" DECIMAL(18,2) NOT NULL,
    "exchange_rate" DECIMAL(18,4) NOT NULL DEFAULT 1,
    "amount_uzs" DECIMAL(18,2) NOT NULL,
    "paid_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "events_number_key" ON "events"("number");

-- CreateIndex
CREATE INDEX "events_start_at_idx" ON "events"("start_at");

-- CreateIndex
CREATE INDEX "events_client_id_idx" ON "events"("client_id");

-- CreateIndex
CREATE INDEX "events_hall_id_start_at_idx" ON "events"("hall_id", "start_at");

-- CreateIndex
CREATE INDEX "events_status_deleted_at_idx" ON "events"("status", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "event_services_event_id_extra_service_id_key" ON "event_services"("event_id", "extra_service_id");

-- CreateIndex
CREATE INDEX "payments_event_id_deleted_at_idx" ON "payments"("event_id", "deleted_at");

-- CreateIndex
CREATE INDEX "payments_paid_at_idx" ON "payments"("paid_at");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_hall_id_fkey" FOREIGN KEY ("hall_id") REFERENCES "halls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_services" ADD CONSTRAINT "event_services_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_services" ADD CONSTRAINT "event_services_extra_service_id_fkey" FOREIGN KEY ("extra_service_id") REFERENCES "extra_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Bir zalda bir vaqtda ikki bron bo'lmasligi baza darajasida kafolatlanadi:
-- ikki operator bir vaqtda saqlasa ham, ikkinchisi rad etiladi.
-- Bekor qilingan va o'chirilgan bronlar vaqtni band qilmaydi.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "events"
  ADD CONSTRAINT "events_hall_time_excl"
  EXCLUDE USING gist (
    "hall_id" WITH =,
    tstzrange("start_at", "end_at", '[)') WITH &&
  )
  WHERE ("status" <> 'CANCELLED' AND "deleted_at" IS NULL);

ALTER TABLE "events" ADD CONSTRAINT "events_time_order_check" CHECK ("end_at" > "start_at");
ALTER TABLE "events" ADD CONSTRAINT "events_amounts_check"
  CHECK ("total_amount" >= 0 AND "paid_amount" >= 0 AND "discount" >= 0 AND "guest_count" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_check"
  CHECK ("amount" > 0 AND "amount_uzs" > 0 AND "exchange_rate" > 0);
