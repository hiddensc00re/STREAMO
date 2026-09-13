"use client";

import { Plus } from "lucide-react";

export function StartStreamFab({ onClick }: { onClick: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <button
        type="button"
        onClick={onClick}
        className="pointer-events-auto inline-flex min-h-14 min-w-14 items-center gap-2 rounded-full bg-amber-400 px-6 text-base font-semibold text-black shadow-[0_12px_40px_rgba(245,193,93,0.35)] hover:bg-amber-300"
      >
        <Plus className="h-5 w-5" aria-hidden />
        Start stream
      </button>
    </div>
  );
}
