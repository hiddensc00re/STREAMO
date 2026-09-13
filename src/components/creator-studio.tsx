"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Maximize2, Minimize2, Pause, Play, Square, Users } from "lucide-react";
import { useHostPeers } from "@/hooks/use-host-peers";
import {
  captureFileStream,
  getCameraStream,
  permissionMessage,
  stopMediaStream,
} from "@/lib/media-client";
import { OWNER_TOKEN_STORAGE_PREFIX, type PublicStream } from "@/lib/types";
import { RESOLUTION_PRESETS, type ResolutionPreset } from "@/lib/media";

export function CreatorStudio({ streamId }: { streamId: string }) {
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
  const [fileName, setFileName] = useState<string | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const fileVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const fileObjectUrlRef = useRef<string | null>(null);

  const { viewerCount, connected, error: peerError, attachStream, endStream, setPaused: setPeersPaused } =
    useHostPeers(broadcasting ? streamId : undefined, broadcasting ? ownerToken : undefined);

  useEffect(() => {
    void fetch(`/api/streams/${streamId}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error ?? "Stream not found.");
        }
        setStream(body as PublicStream);
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

  const startCamera = useCallback(async (preset: ResolutionPreset = resolution) => {
    if (!stream) {
      return;
    }
    setMediaError(null);
    try {
      stopMediaStream(cameraStreamRef.current);
      const media = await getCameraStream(preset, {
        video: stream.hasVideo,
        audio: stream.hasAudio,
      });
      cameraStreamRef.current = media;
      previewStream(media);
      setBroadcasting(true);
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : permissionMessage("both"));
    }
  }, [previewStream, resolution, stream]);

  const onFileChosen = useCallback(
    async (file: File) => {
      setMediaError(null);
      setFileName(file.name);
      if (fileObjectUrlRef.current) {
        URL.revokeObjectURL(fileObjectUrlRef.current);
      }
      const url = URL.createObjectURL(file);
      fileObjectUrlRef.current = url;
      const video = fileVideoRef.current;
      if (!video) {
        return;
      }
      video.src = url;
      video.volume = 0;
      try {
        await video.play();
        const captured = captureFileStream(video);
        previewStream(captured);
        setBroadcasting(true);
      } catch (error) {
        setMediaError(
          error instanceof Error
            ? error.message
            : "Could not play that file. Use an MP4 or WebM video, or an audio file your browser can play.",
        );
      }
    },
    [previewStream],
  );

  useEffect(() => {
    return () => {
      stopMediaStream(cameraStreamRef.current);
      if (fileObjectUrlRef.current) {
        URL.revokeObjectURL(fileObjectUrlRef.current);
      }
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
    const fileVideo = fileVideoRef.current;
    if (fileVideo && stream?.streamType === "file") {
      if (next) {
        fileVideo.pause();
      } else {
        void fileVideo.play();
      }
    }
  };

  const stopBroadcast = async () => {
    endStream();
    stopMediaStream(cameraStreamRef.current);
    cameraStreamRef.current = null;
    fileVideoRef.current?.pause();
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    setBroadcasting(false);
    if (ownerToken) {
      await fetch(`/api/streams/${streamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerToken, isLive: false }),
      });
    }
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

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-400">Creator studio</p>
          <h1 className="text-2xl font-semibold text-white">{stream.title}</h1>
          <p className="text-sm text-zinc-400">{stream.streamerName}</p>
        </div>
        <div className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white/5 px-4 text-sm text-white">
          <Users className="h-4 w-4" aria-hidden />
          <span>{viewerCount} watching</span>
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
          <video ref={fileVideoRef} className="hidden" playsInline loop />
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
          Scheduled for {scheduleLabel}. Start whenever you are ready — keep this tab open if you selected a
          file.
        </p>
      ) : null}

      {stream.streamType === "file" ? (
        <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-2xl border border-dashed border-white/20 px-4 text-sm text-zinc-200">
          <input
            type="file"
            accept="video/*,audio/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void onFileChosen(file);
              }
            }}
          />
          {fileName ? `Selected: ${fileName} (tap to change)` : "Choose a video or audio file to broadcast"}
        </label>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {!broadcasting ? (
          <button
            type="button"
            onClick={() => {
              if (stream.streamType === "live_camera") {
                void startCamera();
                return;
              }
              const fileVideo = fileVideoRef.current;
              if (!fileVideo?.src) {
                setMediaError("Choose a media file first.");
                return;
              }
              void fileVideo
                .play()
                .then(() => {
                  previewStream(captureFileStream(fileVideo));
                  setBroadcasting(true);
                })
                .catch(() => {
                  setMediaError("Could not start playback for this file.");
                });
            }}
            className="col-span-2 inline-flex min-h-12 items-center justify-center rounded-2xl bg-red-600 font-semibold text-white hover:bg-red-500 sm:col-span-1"
          >
            Go live
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
          aria-label="Stop broadcast"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white/10 font-medium text-white"
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
