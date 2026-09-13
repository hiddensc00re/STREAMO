import type { Stream } from "@prisma/client";
import type { PublicStream } from "@/lib/types";

export function toPublicStream(stream: Stream): PublicStream {
  return {
    id: stream.id,
    title: stream.title,
    streamerName: stream.streamerName,
    streamType: stream.streamType,
    hasVideo: stream.hasVideo,
    hasAudio: stream.hasAudio,
    isLive: stream.isLive,
    viewerCount: stream.viewerCount,
    scheduledAt: stream.scheduledAt?.toISOString() ?? null,
    createdAt: stream.createdAt.toISOString(),
    endedAt: stream.endedAt?.toISOString() ?? null,
  };
}
