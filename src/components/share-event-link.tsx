"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";

export function ShareEventLink({ streamId, title }: { streamId: string; title: string }) {
  const path = `/watch/${streamId}`;
  const [viewerUrl] = useState(() =>
    typeof window === "undefined" ? path : new URL(path, window.location.origin).toString(),
  );
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(viewerUrl);
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  }

  async function shareLink() {
    if (!navigator.share) {
      await copyLink();
      return;
    }

    try {
      await navigator.share({
        title,
        text: `Watch ${title} on STREAMO`,
        url: viewerUrl,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      await copyLink();
    }
  }

  return (
    <section className="rounded-3xl border border-amber-400/25 bg-amber-400/10 p-4 sm:p-5" aria-labelledby="share-event-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p id="share-event-heading" className="font-semibold text-white">
            Share the viewer link
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            This link is ready now and stays the same when the event goes live.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void shareLink()}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-amber-400 px-4 text-sm font-semibold text-black hover:bg-amber-300"
        >
          <Share2 className="h-4 w-4" aria-hidden />
          Share
        </button>
      </div>
      <div className="mt-4 flex gap-2">
        <input
          readOnly
          aria-label="Viewer link"
          value={viewerUrl}
          onFocus={(event) => event.currentTarget.select()}
          className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/35 px-4 text-sm text-zinc-200 outline-none focus:border-amber-400"
        />
        <button
          type="button"
          onClick={() => void copyLink()}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-2xl bg-white/10 px-4 text-sm font-medium text-white hover:bg-white/15"
        >
          {status === "copied" ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {status === "copied" ? "Copied" : "Copy"}
        </button>
      </div>
      <p aria-live="polite" className="mt-2 min-h-5 text-xs text-zinc-400">
        {status === "copied" ? "Viewer link copied." : status === "error" ? "Select the link above and copy it manually." : "Anyone with this link can open the event page."}
      </p>
    </section>
  );
}
