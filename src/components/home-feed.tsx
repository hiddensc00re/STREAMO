"use client";

import { useCallback, useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";
import type { PublicStream } from "@/lib/types";
import { StreamCard } from "@/components/stream-card";
import { StartEventModal } from "@/components/start-event-modal";
import { StartStreamFab } from "@/components/start-stream-fab";

export function HomeFeed() {
  const [streams, setStreams] = useState<PublicStream[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/streams", { cache: "no-store" });
      const body = (await response.json()) as { streams?: PublicStream[]; error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Could not load streams.");
      }
      setStreams(body.streams ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load streams.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let socket: Awaited<ReturnType<typeof getSocket>> | undefined;
    const onCount = ({ streamId, viewerCount }: { streamId: string; viewerCount: number }) => {
      setStreams((current) =>
        current.map((stream) => (stream.id === streamId ? { ...stream, viewerCount } : stream)),
      );
    };
    const onLive = () => {
      window.setTimeout(() => {
        void refresh();
      }, 0);
    };

    void (async () => {
      socket = await getSocket();
      if (cancelled) {
        return;
      }
      socket.emit("join-lobby");
      socket.on("viewer-count", onCount);
      socket.on("stream-live", onLive);
      socket.on("stream-ended", onLive);
    })();

    const timer = window.setInterval(() => {
      void refresh();
    }, 8000);
    const initial = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.clearTimeout(initial);
      if (socket) {
        socket.off("viewer-count", onCount);
        socket.off("stream-live", onLive);
        socket.off("stream-ended", onLive);
      }
    };
  }, [refresh]);

  const live = streams.filter((stream) => stream.isLive);
  const upcoming = streams.filter((stream) => !stream.isLive);

  return (
    <>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-32 pt-8">
        <section className="mb-10 max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-400">Now on air</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Tune in live, or listen only.
          </h1>
          <p className="mt-4 text-base leading-7 text-zinc-400">
            STREAMO lets anyone broadcast from a phone or laptop. Viewers can drop video instantly when the
            connection gets tight — audio stays in sync.
          </p>
        </section>

        {error ? (
          <p role="alert" className="mb-6 rounded-2xl bg-red-500/15 px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        {live.length === 0 && upcoming.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/15 px-6 py-16 text-center">
            <p className="text-lg text-zinc-300">No live events right now.</p>
            <p className="mt-2 text-sm text-zinc-500">Tap Start stream to go live from this browser.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {live.length > 0 ? (
              <section aria-labelledby="live-heading">
                <h2 id="live-heading" className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  Live now
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {live.map((stream) => (
                    <StreamCard key={stream.id} stream={stream} />
                  ))}
                </div>
              </section>
            ) : null}
            {upcoming.length > 0 ? (
              <section aria-labelledby="upcoming-heading">
                <h2 id="upcoming-heading" className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  Scheduled
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {upcoming.map((stream) => (
                    <StreamCard key={stream.id} stream={stream} />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </main>
      <StartStreamFab onClick={() => setModalOpen(true)} />
      <StartEventModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
