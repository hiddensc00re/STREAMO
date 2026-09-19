"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Home, Maximize2, Minimize2, Pause, Play, Square, Users } from "lucide-react";
import { useHostPeers } from "@/hooks/use-host-peers";
import {
  getCameraStream,
  permissionMessage,
  stopMediaStream,
} from "@/lib/media-client";
import { OWNER_TOKEN_STORAGE_PREFIX, type PublicStream } from "@/lib/types";
import { RESOLUTION_PRESETS, type ResolutionPreset } from "@/lib/media";
import { safeParseJson } from "@/lib/safe-fetch";
import { ShareEventLink } from "@/components/share-event-link";
import { FileStudio } from "@/components/file-studio";

export function CreatorStudio({ streamId }: { streamId: string }) {
  const router = useRouter();
  const [stream, setStream] = useState<PublicStream | null>(null);
  const [ownerToken] = useState<string | undefined>(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    return localStorage.getItem(`${OWNER_TOKEN_STORAGE_PREFIX}${streamId}`) ?? undefined;
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<ResolutionPreset>("720p");
  const [objectFit, setObjectFit] = useState<"contain" | "cover">("contain");
  const [paused, setPaused] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [changingState, setChangingState] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const { viewerCount, connected, error: peerError, attachStream, endStream, setPaused: setPeersPaused } =
    useHostPeers(broadcasting ? streamId : undefined, broadcasting ? ownerToken : undefined);

  useEffect(() => {
    void fetch(`/api/streams/${streamId}`)
      .then(async (response) => {
        const body = await safeParseJson<PublicStream & { error?: string }>(response);
        if (!response.ok || !body) {
          throw new Error(body?.error ?? "Stream not found.");
        }
        setStream(body);
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : "Stream not found.");
      });
  }, [streamId]);

  const previewStream = useCallback((media: MediaStream) => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = media;
    }
    attachStream(media);
  }, [attachStream]);

  const markLive = useCallback(async (isLive: boolean) => {
    if (!ownerToken) {
      throw new Error("This browser no longer has the owner key for this event.");
    }
    const response = await fetch(`/api/streams/${streamId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerToken, isLive }),
    });
    const body = await safeParseJson<PublicStream & { error?: string }>(response);
    if (!response.ok || !body) {
      throw new Error(body?.error ?? `Could not mark this event ${isLive ? "live" : "ended"}.`);
    }
    setStream(body);
  }, [ownerToken, streamId]);

  const startCamera = useCallback(async (preset: ResolutionPreset = resolution) => {
    if (!stream) {
      return;
    }
    setMediaError(null);
    setChangingState(true);
    try {
      stopMediaStream(cameraStreamRef.current);
      const media = await getCameraStream(preset, {
        video: stream.hasVideo,
        audio: stream.hasAudio,
      });
      cameraStreamRef.current = media;
      previewStream(media);
      await markLive(true);
      setBroadcasting(true);
    } catch (error) {
      stopMediaStream(cameraStreamRef.current);
      cameraStreamRef.current = null;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      setMediaError(error instanceof Error ? error.message : permissionMessage("both"));
    } finally {
      setChangingState(false);
    }
  }, [markLive, previewStream, resolution, stream]);

  useEffect(() => {
    return () => {
      stopMediaStream(cameraStreamRef.current);
    };
  }, []);

  const switchResolution = async (next: ResolutionPreset) => {
    setResolution(next);
    if (stream?.streamType === "live_camera" && broadcasting) {
      await startCamera(next);
    }
  };

  const togglePause = () => {
    const next = !paused;
    setPaused(next);
    setPeersPaused(next);
  };

  const stopBroadcast = async () => {
    setChangingState(true);
    endStream();
    stopMediaStream(cameraStreamRef.current);
    cameraStreamRef.current = null;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    setBroadcasting(false);
    setPaused(false);
    try {
      await markLive(false);
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : "Could not close this event cleanly.");
    } finally {
      setChangingState(false);
    }
  };

  const returnHome = async () => {
    if (broadcasting) {
      await stopBroadcast();
    }
    router.push("/");
  };

  const scheduleLabel = useMemo(() => {
    if (!stream?.scheduledAt) {
      return null;
    }
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(stream.scheduledAt));
  }, [stream]);

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

  if (!stream) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center text-zinc-400">Loading studio…</main>
    );
  }

  if (!ownerToken) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold text-white">This studio is locked</h1>
        <p className="mt-3 text-zinc-400">
          Stream controls stay on the device that created the event. You can still watch as a viewer.
        </p>
        <Link
          href={`/watch/${streamId}`}
          className="mt-6 inline-flex min-h-11 items-center rounded-full bg-amber-400 px-5 font-semibold text-black"
        >
          Open viewer
        </Link>
      </main>
    );
  }

  if (stream.streamType === "file") return <FileStudio stream={stream} ownerToken={ownerToken} />;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-400">Creator studio</p>
          <h1 className="text-2xl font-semibold text-white">{stream.title}</h1>
          <p className="text-sm text-zinc-400">{stream.streamerName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white/5 px-4 text-sm text-white">
            <Users className="h-4 w-4" aria-hidden />
            <span>{viewerCount} watching</span>
          </div>
          <button
            type="button"
            onClick={() => void returnHome()}
            disabled={changingState}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-medium text-white hover:bg-white/15 disabled:opacity-60"
          >
            <Home className="h-4 w-4" aria-hidden />
            {broadcasting ? "End & return home" : "Back to home"}
          </button>
        </div>
      </div>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-black">
        <div className="relative aspect-video bg-[#0b0d14]">
          <video
            ref={localVideoRef}
            className={`h-full w-full bg-black ${objectFit === "cover" ? "object-cover" : "object-contain"}`}
            autoPlay
            muted
            playsInline
          />
          {!broadcasting ? (
            <div className="absolute inset-0 flex items-center justify-center text-zinc-500">
              Preview appears after you go live
            </div>
          ) : null}
          {paused ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-lg font-semibold text-white">
              Paused
            </div>
          ) : null}
        </div>
      </section>

      {scheduleLabel && !broadcasting ? (
        <p className="rounded-2xl bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          Scheduled for {scheduleLabel}. Start whenever you are ready.
        </p>
      ) : null}

      <ShareEventLink streamId={streamId} title={stream.title} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {!broadcasting ? (
          <button
            type="button"
            onClick={() => void startCamera()}
            disabled={changingState}
            className="col-span-2 inline-flex min-h-12 items-center justify-center rounded-2xl bg-red-600 font-semibold text-white hover:bg-red-500 sm:col-span-1"
          >
            {changingState ? "Starting…" : "Go live"}
          </button>
        ) : (
          <button
            type="button"
            onClick={togglePause}
            aria-label={paused ? "Resume broadcast" : "Pause broadcast"}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white/10 font-medium text-white"
          >
            {paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
            {paused ? "Resume" : "Pause"}
          </button>
        )}
        <button
          type="button"
          onClick={() => void stopBroadcast()}
          disabled={!broadcasting || changingState}
          aria-label="Stop broadcast"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white/10 font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Square className="h-4 w-4 fill-current" />
          Stop
        </button>
        <label className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white/10 px-3 text-sm text-white">
          <span className="sr-only">Resolution</span>
          <select
            aria-label="Broadcast resolution"
            value={resolution}
            onChange={(event) => void switchResolution(event.target.value as ResolutionPreset)}
            className="w-full bg-transparent text-white outline-none"
          >
            {Object.keys(RESOLUTION_PRESETS).map((preset) => (
              <option key={preset} value={preset} className="text-black">
                {preset}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setObjectFit((value) => (value === "contain" ? "cover" : "contain"))}
          aria-label={objectFit === "contain" ? "Fill frame with video" : "Fit video inside frame"}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white/10 font-medium text-white"
        >
          {objectFit === "contain" ? <Maximize2 className="h-5 w-5" /> : <Minimize2 className="h-5 w-5" />}
          {objectFit === "contain" ? "Fill" : "Fit"}
        </button>
      </div>

      {peerError || mediaError ? (
        <p role="alert" className="rounded-2xl bg-red-500/15 px-4 py-3 text-sm text-red-200">
          {mediaError ?? peerError}
        </p>
      ) : null}

      <p className="text-sm text-zinc-500">
        {connected ? "Broadcasting to viewers over WebRTC." : "Signaling connects when you go live."} Share{" "}
        <Link className="text-amber-300 underline" href={`/watch/${streamId}`}>
          the viewer link
        </Link>
        .
      </p>
    </main>
  );
}
