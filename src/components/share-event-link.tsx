"use client";

import { useEffect, useState } from "react";
import { Check, Copy, RefreshCcw, Share2 } from "lucide-react";
import { ACCESS_TOKEN_STORAGE_PREFIX, OWNER_TOKEN_STORAGE_PREFIX } from "@/lib/types";

export function ShareEventLink({ streamId, title, isPrivate }: { streamId: string; title: string; isPrivate: boolean }) {
  const [accessToken, setAccessToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    setAccessToken(window.localStorage.getItem(`${ACCESS_TOKEN_STORAGE_PREFIX}${streamId}`) ?? "");
  }, [streamId]);
  const path = `/watch/${streamId}${isPrivate && accessToken ? `?access=${encodeURIComponent(accessToken)}` : ""}`;
  const viewerUrl = isPrivate && !accessToken ? "" : typeof window === "undefined" ? path : new URL(path, window.location.origin).toString();
  async function copy() {
    if (!viewerUrl) return;
    try { await navigator.clipboard.writeText(viewerUrl); setMessage("Copied."); }
    catch { setMessage("Select the link and copy it manually."); }
  }
  async function share() {
    if (!viewerUrl) return;
    if (!navigator.share) { await copy(); return; }
    try { await navigator.share({ title, text: `Watch ${title} on STREAMO`, url: viewerUrl }); }
    catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) await copy(); }
  }
  async function rotate() {
    const owner = localStorage.getItem(`${OWNER_TOKEN_STORAGE_PREFIX}${streamId}`);
    if (!owner) { setMessage("Owner key missing on this device."); return; }
    if (accessToken && !window.confirm("Regenerate the link? The old link will stop working.")) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/streams/${streamId}/access-link`, { method: "POST", headers: { authorization: `Bearer ${owner}` } });
      const body = await response.json();
      if (!response.ok || !body.accessToken) throw new Error(body.error ?? "Could not update link.");
      localStorage.setItem(`${ACCESS_TOKEN_STORAGE_PREFIX}${streamId}`, body.accessToken);
      setAccessToken(body.accessToken); setMessage("Private link updated.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update link."); }
    finally { setBusy(false); }
  }
  return <section className="rounded-3xl border border-amber-400/25 bg-amber-400/10 p-4 sm:p-5" aria-labelledby="share-event-heading">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p id="share-event-heading" className="font-semibold text-white">{isPrivate ? "Private invitation link" : "Share the viewer link"}</p>
        <p className="mt-1 text-sm text-zinc-400">{isPrivate ? "Hidden from the public directory. Share this secret invitation only with your viewers." : "The viewer link stays the same when the event goes live."}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {isPrivate ? <button type="button" disabled={busy} onClick={() => void rotate()} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white/10 px-4 text-sm text-white disabled:opacity-50"><RefreshCcw className="h-4 w-4" />{accessToken ? "Regenerate link" : "Generate link"}</button> : null}
        <button type="button" disabled={!viewerUrl} onClick={() => void share()} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-amber-400 px-4 text-sm font-semibold text-black disabled:opacity-50"><Share2 className="h-4 w-4" />Share</button>
      </div>
    </div>
    <div className="mt-4 flex gap-2">
      <input readOnly aria-label="Viewer link" value={viewerUrl} onFocus={event => event.currentTarget.select()} className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/35 px-4 text-sm text-zinc-200 outline-none focus:border-amber-400" />
      <button type="button" disabled={!viewerUrl} onClick={() => void copy()} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-2xl bg-white/10 px-4 text-sm text-white disabled:opacity-50">{message === "Copied." ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}Copy</button>
    </div>
    <p aria-live="polite" className="mt-2 min-h-5 text-xs text-zinc-400">{message || (isPrivate ? "Anyone with the current link can watch. Regenerating revokes the old invitation for new connections." : "Anyone with this link can watch.")}</p>
  </section>;
}
