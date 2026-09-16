"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Headphones, Volume2, VolumeX, Users } from "lucide-react";
import { useViewerPeer } from "@/hooks/use-viewer-peer";
import type { PublicStream } from "@/lib/types";
import { safeParseJson } from "@/lib/safe-fetch";

export function ViewerStage({ streamId }: { streamId: string }) {
  const [stream, setStream] = useState<PublicStream | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { remoteStream, viewerCount, audioOnly, setAudioOnly, paused, ended, error } =
    useViewerPeer(streamId);

  useEffect(() => {
    void fetch(`/api/streams/${streamId}`)
      .then(async (response) => {
        const body = await safeParseJson<PublicStream & { error?: string }>(response);
        if (!response.ok || !body) {
          throw new Error(body?.error ?? "Stream not found.");
        }
        setStream(body);
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "Stream not found.");
      });
  }, [streamId]);

  useEffect(() => {
    const node = videoRef.current;
    if (!node) {
      return;
    }
    node.srcObject = remoteStream;
    if (remoteStream) {
      void node.play().catch(() => {
        setMuted(true);
      });
    }
  }, [remoteStream]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = muted;
      videoRef.current.volume = volume;
    }
  }, [muted, volume]);

  if (loadError) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center text-zinc-300">
        <p>{loadError}</p>
        <Link href="/" className="mt-4 inline-flex min-h-11 items-center text-amber-300">
          Back to feed
        </Link>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-[calc(100dvh-4rem)] flex-col bg-black">
      <div className="relative flex-1">
        <video
          ref={videoRef}
          className={`h-full w-full bg-black ${audioOnly ? "opacity-0" : "object-contain"}`}
          playsInline
          autoPlay
        />
        {audioOnly ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0b0d14] text-amber-200">
            <Headphones className="h-16 w-16" aria-hidden />
            <p className="text-lg font-medium">Listening only</p>
            <p className="max-w-sm px-6 text-center text-sm text-zinc-400">
              Video is off so this device uses less bandwidth. Audio stays live.
            </p>
          </div>
        ) : null}
        {paused && !ended ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xl font-semibold text-white">
            Stream paused
          </div>
        ) : null}
        {ended ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 text-white">
            <p className="text-2xl font-semibold">This event has ended</p>
            <Link href="/" className="inline-flex min-h-11 items-center rounded-full bg-amber-400 px-5 font-semibold text-black">
              Back to feed
            </Link>
          </div>
        ) : null}

        <div className="pointer-events-none absolute left-3 top-3 right-3 flex items-start justify-between gap-3">
          <div className="pointer-events-auto rounded-2xl bg-black/65 px-4 py-3 text-white backdrop-blur">
            <p className="text-xs uppercase tracking-[0.16em] text-amber-300">
              {stream?.isLive ? "Live" : "Waiting"}
            </p>
            <h1 className="text-lg font-semibold">{stream?.title ?? "Loading…"}</h1>
            <p className="text-sm text-zinc-300">{stream?.streamerName}</p>
          </div>
          <div className="pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full bg-black/65 px-4 text-sm text-white backdrop-blur">
            <Users className="h-4 w-4" aria-hidden />
            {viewerCount}
            <span className="sr-only">viewers connected</span>
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 z-20 border-t border-white/10 bg-[#0b0d14]/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setAudioOnly(!audioOnly)}
            aria-pressed={audioOnly}
            aria-label={audioOnly ? "Watch video and audio" : "Switch to audio only"}
            className={`inline-flex min-h-12 items-center gap-2 rounded-full px-5 font-semibold ${
              audioOnly ? "bg-amber-400 text-black" : "bg-white/10 text-white"
            }`}
          >
            <Headphones className="h-5 w-5" aria-hidden />
            {audioOnly ? "Audio only" : "Listen only"}
          </button>
          <button
            type="button"
            onClick={() => setMuted((value) => !value)}
            aria-label={muted ? "Unmute" : "Mute"}
            className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white"
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          <label className="flex min-h-12 items-center gap-3 rounded-full bg-white/10 px-4 text-sm text-zinc-200">
            <span className="sr-only">Volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              aria-label="Volume"
              onChange={(event) => {
                const next = Number(event.target.value);
                setVolume(next);
                if (next === 0) {
                  setMuted(true);
                } else {
                  setMuted(false);
                }
              }}
              className="w-28 accent-amber-400"
            />
          </label>
          <Link
            href="/"
            className="inline-flex min-h-12 items-center rounded-full bg-white/10 px-5 font-medium text-white"
          >
            Leave
          </Link>
        </div>
        {error ? (
          <p role="alert" className="mx-auto mt-3 max-w-3xl text-center text-sm text-red-200">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}
