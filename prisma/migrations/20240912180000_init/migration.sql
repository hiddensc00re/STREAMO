-- CreateEnum
CREATE TYPE "StreamType" AS ENUM ('live_camera', 'file');

-- CreateTable
CREATE TABLE "streams" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "streamer_name" TEXT NOT NULL,
    "stream_type" "StreamType" NOT NULL,
    "has_video" BOOLEAN NOT NULL,
    "has_audio" BOOLEAN NOT NULL,
    "is_live" BOOLEAN NOT NULL DEFAULT false,
    "viewer_count" INTEGER NOT NULL DEFAULT 0,
    "scheduled_at" TIMESTAMP(3),
    "owner_token_hash" TEXT NOT NULL,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "streams_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "streams_is_live_created_at_idx" ON "streams"("is_live", "created_at");

-- CreateIndex
CREATE INDEX "streams_scheduled_at_idx" ON "streams"("scheduled_at");
