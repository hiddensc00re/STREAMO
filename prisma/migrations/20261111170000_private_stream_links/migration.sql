-- Idempotent additive migration: existing events remain public.
ALTER TABLE "streams" ADD COLUMN IF NOT EXISTS "is_private" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "streams" ADD COLUMN IF NOT EXISTS "access_token_hash" TEXT;
