"use client";

import Link from "next/link";
import { Radio } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/8 bg-[#07080c]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex min-h-11 items-center gap-2 text-white">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400 text-black">
            <Radio aria-hidden className="h-5 w-5" />
          </span>
          <span className="text-lg font-semibold tracking-[0.18em]">STREAMO</span>
        </Link>
        <p className="hidden text-sm text-zinc-400 sm:block">Live events. Zero setup.</p>
      </div>
    </header>
  );
}
