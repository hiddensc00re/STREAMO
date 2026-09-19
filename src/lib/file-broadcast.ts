import { z } from "zod";

export const FILE_LIMIT = 50_000_000;
export const FILE_SLOTS = 18; // Reserve 50 MB per ticket: at most 900 MB of the free 1 GB.
export const fileMime = z.enum(["video/mp4", "video/quicktime", "audio/mp4", "audio/mpeg"]);
export const fileAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare"), name: z.string().min(1).max(180), mime: fileMime, size: z.number().int().positive().max(FILE_LIMIT) }),
  z.object({ action: z.literal("complete"), duration: z.number().finite().positive().max(21600) }),
  z.object({ action: z.enum(["start", "pause", "resume", "stop", "remove"]) }),
]);

export type FileState = {
  name: string;
  status: string;
  duration: number;
  position: number;
  serverNow: number;
  removableAt: string;
};

export function playbackPosition(file: { status: string; position: number; duration: number; anchor: Date | string }, now = Date.now()) {
  const elapsed = file.status === "playing" ? Math.max(0, (now - new Date(file.anchor).getTime()) / 1000) : 0;
  return Math.min(file.duration, Math.max(0, file.position + elapsed));
}
