import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ownerTokenMatches } from "@/lib/owner-token";
import { looksSafeId, sanitizeText } from "@/lib/sanitize";
import { fileAction, FILE_LIMIT, FILE_SLOTS, playbackPosition } from "@/lib/file-broadcast";
import { mediaBucket } from "@/lib/storage-server";
import { SlidingWindowLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const limiter = new SlidingWindowLimiter(30, 60000);
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
class FileError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  if (!looksSafeId(id)) return json({ error: "Event not found." }, 404);
  const file = await prisma.fileBroadcast.findUnique({ where: { streamId: id } });
  if (!file) return json({ file: null });
  const now = Date.now();
  const position = playbackPosition(file, now);
  const finished = file.status === "playing" && position >= file.duration;
  if (finished) {
    // Compare the anchor too, so an older read cannot end a newly restarted event.
    await prisma.$transaction(async (tx) => {
      const changed = await tx.fileBroadcast.updateMany({ where: { streamId: id, status: "playing", anchor: file.anchor }, data: { status: "ended", position } });
      if (changed.count) await tx.stream.update({ where: { id }, data: { isLive: false, endedAt: new Date(now) } });
    });
  }
  return json({ file: { name: file.name, status: finished ? "ended" : file.status, duration: file.duration, position, serverNow: now, removableAt: file.uploadUntil.toISOString() } });
}

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  if (!looksSafeId(id)) return json({ error: "Event not found." }, 404);
  limiter.prune();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!limiter.consume(ip)) return json({ error: "Too many attempts. Try again in a minute." }, 429);
  const ownerToken = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const stream = await prisma.stream.findUnique({ where: { id } });
  if (!stream || !ownerTokenMatches(ownerToken, stream.ownerTokenHash)) return json({ error: "Not authorized to control this event." }, 403);
  if (stream.streamType !== "file") return json({ error: "This event uses a camera." }, 400);
  const parsed = fileAction.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Use a supported media file up to 50 MB and six hours." }, 400);
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Serialize reservations and controls across all Vercel instances.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73628491)`;
      const bucket = mediaBucket();
      const action = parsed.data;
      let file = await tx.fileBroadcast.findUnique({ where: { streamId: id } });
      const now = new Date();
      if (action.action === "prepare") {
        if (file && (file.status !== "uploading" || file.size !== action.size || file.mime !== action.mime || file.name !== sanitizeText(action.name, 180))) {
          throw new FileError("Remove the previous upload before choosing another file.", 409);
        }
        if (!file) {
          if (await tx.fileBroadcast.count() >= FILE_SLOTS) throw new FileError("Free upload storage is full. Remove an old upload to make room.", 409);
          file = await tx.fileBroadcast.create({ data: { streamId: id, path: `${id}/${randomUUID()}`, name: sanitizeText(action.name, 180), mime: action.mime, size: action.size, uploadUntil: new Date(now.getTime() + 2 * 3600000 + 60000) } });
        }
        const { data, error } = await bucket.createSignedUploadUrl(file.path, { upsert: false });
        if (error || !data) throw new FileError("Could not prepare storage. Try again shortly.", 503);
        await tx.fileBroadcast.update({ where: { streamId: id }, data: { uploadUntil: new Date(Date.now() + 2 * 3600000 + 60000) } });
        return { signedUrl: data.signedUrl };
      }
      if (!file) throw new FileError("Upload a file first.", 409);
      if (action.action === "complete") {
        if (file.status !== "uploading") throw new FileError("This upload has already been finalized.", 409);
        const { data, error } = await bucket.info(file.path);
        if (error || !data) throw new FileError("Upload has not completed. Retry the upload.", 409);
        if (data.size !== file.size || data.size > FILE_LIMIT || data.contentType !== file.mime) throw new FileError("Uploaded file does not match its declared size or type.", 400);
        await tx.fileBroadcast.update({ where: { streamId: id }, data: { status: "ready", duration: action.duration } });
      } else if (action.action === "remove") {
        if (file.status === "playing" || file.status === "paused") throw new FileError("Stop the event before removing its file.", 409);
        // Prevent a still-valid signed upload URL from restoring an untracked object.
        if (file.uploadUntil > now) throw new FileError(`This upload can be removed after ${file.uploadUntil.toISOString()}.`, 409);
        const { error } = await bucket.remove([file.path]);
        if (error) throw new FileError("Could not remove the file. Try again.", 503);
        await tx.fileBroadcast.delete({ where: { streamId: id } });
      } else {
        if (file.status === "uploading") throw new FileError("Finish uploading before starting.", 409);
        const live = action.action !== "stop";
        if (action.action === "pause" && file.status !== "playing") throw new FileError("The event is not playing.", 409);
        if (action.action === "resume" && file.status !== "paused") throw new FileError("The event is not paused.", 409);
        if (action.action === "start" && !["ready", "ended"].includes(file.status)) throw new FileError("The event has already started.", 409);
        await tx.fileBroadcast.update({ where: { streamId: id }, data: {
          status: action.action === "stop" ? "ended" : action.action === "pause" ? "paused" : "playing",
          position: action.action === "start" ? 0 : playbackPosition(file, now.getTime()), anchor: now,
        } });
        await tx.stream.update({ where: { id }, data: { isLive: live, endedAt: live ? null : now } });
      }
      return { ok: true };
    }, { timeout: 25000, maxWait: 5000 });
    return json(result);
  } catch (error) {
    return json({ error: error instanceof FileError ? error.message : "File service is unavailable. Please try again shortly." }, error instanceof FileError ? error.status : 503);
  }
}
