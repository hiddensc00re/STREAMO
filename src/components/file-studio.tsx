"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ShareEventLink } from "@/components/share-event-link";
import { FILE_LIMIT, fileMime, type FileState } from "@/lib/file-broadcast";
import type { PublicStream } from "@/lib/types";

export function FileStudio({ stream, ownerToken }: { stream: PublicStream; ownerToken: string }) {
  const endpoint = `/api/streams/${stream.id}/file`;
  const [state, setState] = useState<FileState | null>(null);
  const [selected, setSelected] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const upload = useRef<XMLHttpRequest | null>(null);
  const live = state?.status === "playing" || state?.status === "paused";
  const refresh = useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load upload status. Try again.");
    const body = await response.json();
    setState(body.file);
    setLoaded(true);
  }, [endpoint]);
  useEffect(() => {
    const update = () => void refresh().catch((err) => setError(err.message));
    update();
    const timer = setInterval(update, 6000);
    return () => { clearInterval(timer); upload.current?.abort(); };
  }, [refresh]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const command = async (body: object) => {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not update this event.");
    return result;
  };
  const act = async (action: string) => {
    setBusy(true); setError(undefined);
    try {
      await command({ action });
      await refresh();
      if (action === "remove") { setSelected(null); setPreview(undefined); }
    } catch (err) { setError(err instanceof Error ? err.message : "Please try again."); }
    finally { setBusy(false); }
  };
  const sendFile = async () => {
    if (!selected) return;
    const duration = video.current?.duration;
    if (!duration || !Number.isFinite(duration) || duration > 21600) {
      setError("Wait for the preview to load. Choose a playable video or audio file no longer than six hours."); return;
    }
    setBusy(true); setProgress(0); setError(undefined);
    try {
      const { signedUrl } = await command({ action: "prepare", name: selected.name, mime: selected.type, size: selected.size });
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        upload.current = xhr;
        setUploading(true);
        xhr.open("PUT", signedUrl);
        xhr.timeout = 15 * 60000;
        xhr.upload.onprogress = (event) => { if (event.lengthComputable) setProgress(Math.round(100 * event.loaded / event.total)); };
        xhr.onerror = () => reject(new Error("Upload interrupted. Keep Safari open and retry with the same file."));
        xhr.ontimeout = () => reject(new Error("Upload timed out. Try a smaller file or faster connection."));
        xhr.onabort = () => reject(new Error("Upload cancelled. You can retry with the same file."));
        // If an earlier request finished but its response was lost, verify it with complete.
        xhr.onload = () => {
          if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 400 || xhr.status === 409) resolve();
          else reject(new Error(`Upload failed (${xhr.status}). Check the file size and format, then retry.`));
        };
        const data = new FormData();
        data.append("cacheControl", "0");
        data.append("", selected);
        xhr.send(data);
      });
      await command({ action: "complete", duration });
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not upload the file."); }
    finally { upload.current = null; setUploading(false); setBusy(false); }
  };
  const buttonClass = "min-h-12 rounded-full bg-white/10 px-5 py-3 text-white disabled:opacity-40";
  return <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 text-white">
    <h1 className="text-2xl font-semibold">{stream.title}</h1>
    <p className="text-zinc-300">Upload your file, then start a shared viewing event. Late viewers join the current playback position.</p>
    <p className="text-sm text-zinc-400">Free uploads: up to 50 MB each. MP4/MOV video or MP3/M4A audio. No format conversion; H.264 video with AAC audio is recommended for broad compatibility. Keep Safari open during upload.</p>
    <ShareEventLink streamId={stream.id} title={stream.title} />
    {!state || state.status === "uploading" ? <label className="block rounded-2xl border border-dashed border-white/25 p-5">
      <span>Choose a file from your device</span>
      <input type="file" aria-label="Choose media file" accept="video/mp4,video/quicktime,audio/mp4,audio/mpeg,.mp4,.mov,.m4a,.mp3" disabled={busy || !loaded} className="mt-3 block w-full" onChange={(event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!fileMime.safeParse(file.type).success || file.size <= 0 || file.size > FILE_LIMIT) { setError("Choose an MP4, MOV, MP3 or M4A file up to 50 MB."); event.target.value = ""; return; }
        setError(undefined); setSelected(file); setPreview(URL.createObjectURL(file));
      }} />
    </label> : null}
    {preview ? <video ref={video} src={preview} preload="metadata" playsInline controls className="max-h-96 w-full rounded-2xl bg-black" onError={() => setError("Safari cannot preview this file. Export it as H.264/AAC MP4 and try again.")} /> : null}
    <p role="status">{state ? `${state.name} — ${state.status}` : loaded ? "No file uploaded yet" : "Loading upload status…"}</p>
    <div className="flex flex-wrap gap-3">
      {(!state || state.status === "uploading") && <button className={buttonClass} disabled={busy || !selected || !loaded} onClick={() => void sendFile()}>{busy ? `Uploading ${progress}%` : "Upload file"}</button>}
      {uploading ? <button className={buttonClass} onClick={() => upload.current?.abort()}>Cancel upload</button> : null}
      {state && ["ready", "ended"].includes(state.status) ? <button className={`${buttonClass} bg-red-600`} disabled={busy} onClick={() => void act("start")}>Start event</button> : null}
      {live ? <>
        <button className={buttonClass} disabled={busy} onClick={() => void act(state?.status === "paused" ? "resume" : "pause")}>{state?.status === "paused" ? "Resume" : "Pause"}</button>
        <button className={buttonClass} disabled={busy} onClick={() => void act("stop")}>End event</button>
        <Link className={buttonClass} href={`/watch/${stream.id}`}>Open live player</Link>
      </> : null}
      {state && !live ? <button className={buttonClass} disabled={busy || state.serverNow < Date.parse(state.removableAt)} onClick={() => { if (window.confirm("Permanently remove this uploaded file?")) void act("remove"); }}>Remove upload</button> : null}
      <Link className={buttonClass} href="/">Back to feed</Link>
    </div>
    {state && !live && state.serverNow < Date.parse(state.removableAt) ? <p className="text-sm text-zinc-400">You can remove or replace this upload after {new Date(state.removableAt).toLocaleTimeString()}. This prevents an unfinished upload from restoring a removed file.</p> : null}
    {live ? <p className="text-amber-200">The event plays from uploaded storage. Closing this page does not stop it; use End event to stop playback.</p> : null}
    {error ? <p role="alert" className="rounded-xl bg-red-500/15 p-4 text-red-200">{error}</p> : null}
  </main>;
}
