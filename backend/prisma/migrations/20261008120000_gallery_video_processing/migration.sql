-- CreateEnum
CREATE TYPE "MediaProcessingStatus" AS ENUM ('READY', 'PROCESSING', 'FAILED');

-- AlterTable
ALTER TABLE "gallery_items" ADD COLUMN "processing_status" "MediaProcessingStatus" NOT NULL DEFAULT 'READY';
