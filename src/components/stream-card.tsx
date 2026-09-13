import Link from "next/link";
import { Eye, Mic, Radio, Video } from "lucide-react";
import type { PublicStream } from "@/lib/types";

function formatWhen(iso: string | null): string {
  if (!iso) {
    return "Goes live soon";
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function StreamCard({ stream }: { stream: PublicStream }) {
  const href = `/watch/${stream.id}`;
  const live = stream.isLive;

  return (
    <article>
      <Link
        href={href}
        className="group block overflow-hidden rounded-3xl border border-white/8 bg-[#12141c] transition hover:border-amber-400/50 hover:bg-[#171a24] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
      >
        <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-[#1b2133] via-[#12141c] to-[#2a1d12]">
          <div className="absolute inset-0 opacity-70" aria-hidden>
            <div className="absolute -left-8 top-6 h-32 w-32 rounded-full bg-amber-400/20 blur-3xl" />
            <div className="absolute right-0 bottom-0 h-40 w-40 rounded-full bg-red-500/10 blur-3xl" />
          </div>
          <div className="absolute left-3 top-3 flex items-center gap-2">
            {live ? (
              <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-red-600 px-3 text-xs font-semibold uppercase tracking-wide text-white">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                Live
              </span>
            ) : (
              <span className="inline-flex min-h-8 items-center rounded-full bg-white/10 px-3 text-xs font-semibold uppercase tracking-wide text-amber-200">
                Scheduled
              </span>
            )}
          </div>
          <div className="absolute bottom-3 right-3 inline-flex min-h-8 items-center gap-1.5 rounded-full bg-black/70 px-3 text-sm text-white">
            <Eye aria-hidden className="h-4 w-4" />
            <span>{stream.viewerCount}</span>
            <span className="sr-only">viewers watching</span>
          </div>
          <div className="absolute inset-0 flex items-center justify-center text-amber-200/80">
            {stream.hasVideo ? <Video className="h-12 w-12" aria-hidden /> : <Mic className="h-12 w-12" aria-hidden />}
          </div>
        </div>
        <div className="space-y-2 px-4 py-4">
          <h2 className="text-lg font-semibold leading-snug text-white group-hover:text-amber-200">
            {stream.title}
          </h2>
          <p className="flex items-center gap-2 text-sm text-zinc-400">
            <Radio aria-hidden className="h-4 w-4 text-amber-400" />
            {stream.streamerName}
          </p>
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            {stream.streamType === "file" ? "File broadcast" : "Camera"}
            {stream.hasVideo ? " · Video" : ""}
            {stream.hasAudio ? " · Audio" : ""}
            {!live ? ` · ${formatWhen(stream.scheduledAt)}` : ""}
          </p>
        </div>
      </Link>
    </article>
  );
}
