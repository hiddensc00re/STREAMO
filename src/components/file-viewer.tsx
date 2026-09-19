"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { FileState } from "@/lib/file-broadcast";
import type { PublicStream } from "@/lib/types";

export function FileViewer({ stream }: { stream: PublicStream }) {
  const [state, setState] = useState<FileState | null>(null);
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<string>();
  const [connectionError, setConnectionError] = useState<string>();
  const [needsTap, setNeedsTap] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const clock = useRef<{ state: FileState; receivedAt: number } | null>(null);
  const live = state?.status === "playing" || state?.status === "paused";
  const sync = useCallback(() => {
    const node = video.current;
    const latest = clock.current;
    if (!node || !latest || node.readyState < 1) return;
    const file = latest.state;
    const playing = file.status === "playing";
    const position = Math.min(file.duration, file.position + (playing ? (performance.now() - latest.receivedAt) / 1000 : 0));
    if (Math.abs(node.currentTime - position) > 1.5) node.currentTime = position;
    if (playing && position < file.duration) void node.play().then(() => setNeedsTap(false)).catch(() => setNeedsTap(true));
    else node.pause();
  }, []);
  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/streams/${stream.id}/file`, { cache: "no-store" });
        if (!response.ok) throw new Error("Could not refresh the event. Retrying…");
        const body = await response.json();
        if (disposed) return;
        setConnectionError(undefined);
        setState(body.file);
        if (body.file) clock.current = { state: body.file, receivedAt: performance.now() };
        else { clock.current = null; video.current?.pause(); }
        sync();
      } catch (err) { if (!disposed) { video.current?.pause(); setConnectionError(err instanceof Error ? err.message : "Connection interrupted."); } }
    };
    const refreshVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    void refresh();
    const timer = setInterval(() => void refresh(), 4000);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => { disposed = true; clearInterval(timer); document.removeEventListener("visibilitychange", refreshVisible); };
  }, [stream.id, sync]);
  const loadVideo = useCallback(async () => {
    const response = await fetch(`/api/streams/${stream.id}/file/playback`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Could not load the video.");
    setUrl(body.url); setError(undefined);
  }, [stream.id]);
  useEffect(() => {
    if (!live) return;
    let disposed = false;
    const load = () => void loadVideo().catch((err) => { if (!disposed) setError(err.message); });
    load();
    const renewal = setInterval(load, 50 * 60000);
    return () => { disposed = true; clearInterval(renewal); };
  }, [live, loadVideo]);
  return <main className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6 text-white">
    <h1 className="text-2xl font-semibold">{stream.title}</h1>
    <p className="text-zinc-400">{stream.streamerName} · Shared file playback</p>
    <video ref={video} src={live ? url : undefined} playsInline controls autoPlay muted preload="metadata" onLoadedMetadata={sync} onError={() => setError("This file could not play. Retry, or ask the creator for an H.264/AAC MP4 version.")} className="aspect-video w-full rounded-2xl bg-black" />
    <p role="status">{state?.status === "ended" ? "This event has ended." : state?.status === "paused" ? "The creator paused the event." : live ? "You are watching at the event’s current position." : "Waiting for the creator to start the event…"}</p>
    {live ? <button className="min-h-12 rounded-full bg-amber-400 px-5 font-semibold text-black" onClick={() => { if (video.current) { video.current.muted = false; sync(); } }}>{needsTap ? "Tap to play with sound" : "Enable sound"}</button> : null}
    {connectionError ? <p role="alert" className="text-red-200">{connectionError}</p> : null}
    {error ? <div role="alert" className="rounded-xl bg-red-500/15 p-4 text-red-200"><p>{error}</p>{live ? <button className="mt-3 min-h-11 underline" onClick={() => void loadVideo().catch((err) => setError(err.message))}>Retry playback</button> : null}</div> : null}
    <Link href="/" className="inline-flex min-h-12 items-center px-5 text-amber-300">Back to feed</Link>
  </main>;
}
