import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { looksSafeId } from "@/lib/sanitize";
import { ownerTokenMatches } from "@/lib/owner-token";
import { secretsEqual } from "@/lib/secrets";
import { updateStreamSchema } from "@/lib/media";
import { toPublicStream } from "@/lib/stream-mapper";
import { SlidingWindowLimiter } from "@/lib/rate-limit";
import { safeParseRequestBody } from "@/lib/safe-fetch";

export const dynamic = "force-dynamic";

const patchLimiter = new SlidingWindowLimiter(40, 60_000);

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!looksSafeId(id)) {
    return NextResponse.json({ error: "Stream not found." }, { status: 404 });
  }

  const stream = await prisma.stream.findUnique({ where: { id } });
  if (!stream) {
    return NextResponse.json({ error: "Stream not found." }, { status: 404 });
  }

  return NextResponse.json(toPublicStream(stream));
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!patchLimiter.consume(clientIp(request))) {
    return NextResponse.json({ error: "Too many updates." }, { status: 429 });
  }

  const { id } = await context.params;
  if (!looksSafeId(id)) {
    return NextResponse.json({ error: "Stream not found." }, { status: 404 });
  }

  const json = await safeParseRequestBody(request);
  if (!json) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = updateStreamSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update." }, { status: 400 });
  }

  const stream = await prisma.stream.findUnique({ where: { id } });
  if (!stream) {
    return NextResponse.json({ error: "Stream not found." }, { status: 404 });
  }

  const internalSecret = request.headers.get("x-internal-secret");
  const expected = process.env.INTERNAL_API_SECRET;
  const isInternal = Boolean(expected && internalSecret && secretsEqual(internalSecret, expected));

  if (!isInternal && !ownerTokenMatches(parsed.data.ownerToken, stream.ownerTokenHash)) {
    return NextResponse.json({ error: "Not authorized to control this stream." }, { status: 403 });
  }

  if (stream.streamType === "file" && typeof parsed.data.isLive === "boolean") {
    return NextResponse.json({ error: "Use the uploaded file event controls." }, { status: 409 });
  }

  const updated = await prisma.stream.update({
    where: { id },
    data: {
      isLive: parsed.data.isLive,
      hasVideo: parsed.data.hasVideo,
      hasAudio: parsed.data.hasAudio,
      viewerCount: parsed.data.viewerCount,
      endedAt:
        parsed.data.isLive === false
          ? new Date()
          : parsed.data.isLive === true
            ? null
            : undefined,
    },
  });

  return NextResponse.json(toPublicStream(updated));
}
