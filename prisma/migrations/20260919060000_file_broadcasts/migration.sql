CREATE TABLE "file_broadcasts" (
  "stream_id" TEXT NOT NULL PRIMARY KEY,
  "path" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "duration" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'uploading',
  "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "anchor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "upload_until" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "file_broadcasts_stream_id_fkey" FOREIGN KEY ("stream_id") REFERENCES "streams"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "file_broadcasts_path_key" ON "file_broadcasts"("path");
