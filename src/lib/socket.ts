"use client";

import { io, type Socket } from "socket.io-client";
import { safeParseJson } from "@/lib/safe-fetch";

let socket: Socket | null = null;
let socketPromise: Promise<Socket> | null = null;

export function getSignalingUrlFallback(): string {
  return process.env.NEXT_PUBLIC_SIGNALING_URL ?? "http://localhost:4001";
}

export async function getSocket(): Promise<Socket> {
  if (socket) {
    return socket;
  }
  if (!socketPromise) {
    socketPromise = (async () => {
      let signalingUrl = getSignalingUrlFallback();
      try {
        const response = await fetch("/api/config", { cache: "no-store" });
        if (response.ok) {
          const body = await safeParseJson<{ signalingUrl?: string }>(response);
          if (body?.signalingUrl) {
            signalingUrl = body.signalingUrl;
          }
        }
      } catch {
        // Local fallback if the config route is unreachable.
      }
      socket = io(signalingUrl, {
        transports: ["websocket", "polling"],
        autoConnect: true,
      });
      return socket;
    })();
  }
  return socketPromise;
}
