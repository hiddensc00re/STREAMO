import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { looksSafeId } from "@/lib/sanitize";
import { mediaBucket } from "@/lib/storage-server";
import { playbackPosition } from "@/lib/file-broadcast";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!looksSafeId(id)) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const file = await prisma.fileBroadcast.findUnique({ where: { streamId: id }, include: { stream: true } });
  if (!file || !file.stream.isLive || !["playing", "paused"].includes(file.status) || playbackPosition(file) >= file.duration) {
    return NextResponse.json({ error: "This file event is not live." }, { status: 409 });
  }
  try {
    const { data, error } = await mediaBucket().createSignedUrl(file.path, 3600);
    if (error || !data) throw new Error("Storage unavailable");
    return NextResponse.json({ url: data.signedUrl }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Video is temporarily unavailable. Try again." }, { status: 503 });
  }
}
