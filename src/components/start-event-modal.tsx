"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Upload, Video, X } from "lucide-react";
import { DISPLAY_NAME_KEY, OWNER_TOKEN_STORAGE_PREFIX, type CreateStreamResponse } from "@/lib/types";
import { STREAM_TITLE_MAX, STREAMER_NAME_MAX } from "@/lib/media";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function StartEventModal({ open, onClose }: Props) {
  const router = useRouter();
  const [streamerName, setStreamerName] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return localStorage.getItem(DISPLAY_NAME_KEY) ?? "";
  });
  const [title, setTitle] = useState("");
  const [source, setSource] = useState<"live_camera" | "file">("live_camera");
  const [hasVideo, setHasVideo] = useState(true);
  const [hasAudio, setHasAudio] = useState(true);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) {
    return null;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!hasVideo && !hasAudio) {
      setError("Choose at least audio or video.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/streams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          streamerName,
          streamType: source,
          hasVideo,
          hasAudio,
          scheduledAt: scheduleEnabled && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        }),
      });
      const body = (await response.json()) as CreateStreamResponse & { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Could not create the event.");
      }
      localStorage.setItem(DISPLAY_NAME_KEY, streamerName.trim());
      localStorage.setItem(`${OWNER_TOKEN_STORAGE_PREFIX}${body.id}`, body.ownerToken);
      onClose();
      router.push(`/studio/${body.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the event.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6">
      <button type="button" className="absolute inset-0" aria-label="Close start event dialog" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-event-title"
        className="relative z-10 max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-[#12141c] p-5 shadow-2xl sm:rounded-3xl sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="start-event-title" className="text-xl font-semibold text-white">
              Start an event
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              No account needed. Broadcast from this browser, or queue a local file for later.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/5 text-white hover:bg-white/10"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-zinc-200">Streamer display name</span>
            <input
              required
              maxLength={STREAMER_NAME_MAX}
              value={streamerName}
              onChange={(event) => setStreamerName(event.target.value)}
              className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-white outline-none ring-amber-400 focus:ring-2"
              placeholder="Maya from the park"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-zinc-200">Event title</span>
            <input
              required
              maxLength={STREAM_TITLE_MAX}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-white outline-none ring-amber-400 focus:ring-2"
              placeholder="Sunset jazz on the square"
            />
          </label>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-zinc-200">Broadcast source</legend>
            <div className="grid grid-cols-2 gap-2">
              <SourceChoice
                selected={source === "live_camera"}
                icon={<Video className="h-5 w-5" />}
                label="Camera"
                onClick={() => setSource("live_camera")}
              />
              <SourceChoice
                selected={source === "file"}
                icon={<Upload className="h-5 w-5" />}
                label="Media file"
                onClick={() => setSource("file")}
              />
            </div>
          </fieldset>

          <fieldset className="flex gap-3">
            <label className="inline-flex min-h-11 items-center gap-2 text-sm text-zinc-200">
              <input type="checkbox" checked={hasVideo} onChange={(event) => setHasVideo(event.target.checked)} />
              Video
            </label>
            <label className="inline-flex min-h-11 items-center gap-2 text-sm text-zinc-200">
              <input type="checkbox" checked={hasAudio} onChange={(event) => setHasAudio(event.target.checked)} />
              Audio
            </label>
          </fieldset>

          <label className="flex min-h-11 items-center gap-2 text-sm text-zinc-200">
            <input
              type="checkbox"
              checked={scheduleEnabled}
              onChange={(event) => setScheduleEnabled(event.target.checked)}
            />
            <CalendarClock className="h-4 w-4" aria-hidden />
            Schedule for later
          </label>

          {scheduleEnabled ? (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-zinc-200">Go-live time</span>
              <input
                type="datetime-local"
                required
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
                className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-white outline-none ring-amber-400 focus:ring-2"
              />
              <span className="block text-xs text-zinc-500">
                Files stay on this device. Re-open STREAMO at the scheduled time to go live.
              </span>
            </label>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-2xl bg-red-500/15 px-4 py-3 text-sm text-red-200">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-amber-400 text-base font-semibold text-black hover:bg-amber-300 disabled:opacity-60"
          >
            {submitting ? "Creating…" : scheduleEnabled ? "Schedule event" : "Open studio"}
          </button>
        </form>
      </div>
    </div>
  );
}

function SourceChoice({
  selected,
  icon,
  label,
  onClick,
}: {
  selected: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex min-h-14 items-center justify-center gap-2 rounded-2xl border px-3 text-sm font-medium ${
        selected
          ? "border-amber-400 bg-amber-400/15 text-amber-100"
          : "border-white/10 bg-black/30 text-zinc-300"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
