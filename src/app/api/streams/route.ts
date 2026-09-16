import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sanitizeText } from "@/lib/sanitize";
import { createOwnerToken, hashOwnerToken } from "@/lib/owner-token";
import {
  STREAM_TITLE_MAX,
  STREAMER_NAME_MAX,
  createStreamSchema,
} from "@/lib/media";
import { SlidingWindowLimiter } from "@/lib/rate-limit";
import { toPublicStream } from "@/lib/stream-mapper";
import { safeParseRequestBody } from "@/lib/safe-fetch";

export const dynamic = "force-dynamic";

const createLimiter = new SlidingWindowLimiter(8, 60_000);

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function GET() {
  const streams = await prisma.stream.findMany({
    where: {
      OR: [
        { isLive: true },
        {
          endedAt: null,
          scheduledAt: { not: null, gte: new Date(Date.now() - 5 * 60_000) },
        },
      ],
    },
    orderBy: [{ isLive: "desc" }, { viewerCount: "desc" }, { createdAt: "desc" }],
    take: 60,
  });

  return NextResponse.json({ streams: streams.map(toPublicStream) });
}

export async function POST(request: Request) {
  if (!createLimiter.consume(clientIp(request))) {
    return NextResponse.json({ error: "Too many streams created. Try again shortly." }, { status: 429 });
  }

  const json = await safeParseRequestBody(request);
  if (!json) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = createStreamSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid stream details." }, { status: 400 });
  }

  const title = sanitizeText(parsed.data.title, STREAM_TITLE_MAX);
  const streamerName = sanitizeText(parsed.data.streamerName, STREAMER_NAME_MAX);

  if (!title || !streamerName) {
    return NextResponse.json({ error: "Title and streamer name are required." }, { status: 400 });
  }

  if (!parsed.data.hasVideo && !parsed.data.hasAudio) {
    return NextResponse.json({ error: "A stream must include audio, video, or both." }, { status: 400 });
  }

  const scheduledAt = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null;
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ error: "Invalid schedule time." }, { status: 400 });
  }
  if (scheduledAt && scheduledAt.getTime() < Date.now() - 60_000) {
    return NextResponse.json({ error: "Schedule time must be in the future." }, { status: 400 });
  }

  const ownerToken = createOwnerToken();
  const stream = await prisma.stream.create({
    data: {
      title,
      streamerName,
      streamType: parsed.data.streamType,
      hasVideo: parsed.data.hasVideo,
      hasAudio: parsed.data.hasAudio,
      isLive: false,
      scheduledAt,
      ownerTokenHash: hashOwnerToken(ownerToken),
    },
  });

  return NextResponse.json({ ...toPublicStream(stream), ownerToken }, { status: 201 });
}
