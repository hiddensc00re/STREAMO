"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";
import { createPeerConnection } from "@/lib/media-client";
import { addOrQueueIceCandidate, flushIceCandidates } from "@/lib/ice-candidates";
import { getOrCreateSessionId } from "@/lib/types";

type SignalIn = {
  from: string;
  data:
    | { type: "offer"; sdp: string }
    | { type: "ice"; candidate: RTCIceCandidateInit }
    | { type: "paused"; paused: boolean }
    | { type: "ended" };
};

export type ViewerConnectionState = "connecting" | "retrying" | "connected" | "failed";

const MAX_CONNECT_RETRIES = 3;
const CONNECT_RETRY_DELAY_MS = 7_000;

export function useViewerPeer(streamId: string | undefined, enabled = true) {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [audioOnly, setAudioOnly] = useState(false);
  const [paused, setPaused] = useState(false);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ViewerConnectionState>("connecting");
  const [restartNonce, setRestartNonce] = useState(0);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const audioOnlyRef = useRef(false);

  const retry = useCallback(() => {
    remoteStreamRef.current = null;
    setRemoteStream(null);
    setError(null);
    setEnded(false);
    setConnectionState("connecting");
    setRestartNonce((value) => value + 1);
  }, []);

  const applyAudioOnly = useCallback((nextEnabled: boolean) => {
    audioOnlyRef.current = nextEnabled;
    setAudioOnly(nextEnabled);
    const stream = remoteStreamRef.current;
    stream?.getVideoTracks().forEach((track) => {
      track.enabled = !nextEnabled;
    });
    void getSocket().then((socket) => {
      socket.emit("signal", {
        to: "host",
        data: { type: "consume-mode", audioOnly: nextEnabled },
      });
    });
  }, []);

  useEffect(() => {
    if (!streamId || !enabled) {
      return;
    }

    let cancelled = false;
    let socket: Awaited<ReturnType<typeof getSocket>> | undefined;
    let retryTimer: number | undefined;
    let retryAttempts = 0;
    let pendingIceCandidates: RTCIceCandidateInit[] = [];
    const sessionId = getOrCreateSessionId();

    const clearRetryTimer = () => {
      if (retryTimer !== undefined) {
        window.clearTimeout(retryTimer);
        retryTimer = undefined;
      }
    };

    const failConnection = (message: string) => {
      clearRetryTimer();
      setConnectionState("failed");
      setError(message);
    };

    function scheduleRetry(delay: number) {
      clearRetryTimer();
      retryTimer = window.setTimeout(() => {
        if (cancelled || remoteStreamRef.current) {
          return;
        }
        if (retryAttempts >= MAX_CONNECT_RETRIES) {
          failConnection("Could not establish the media connection. Check the network and try again.");
          return;
        }
        retryAttempts += 1;
        joinViewer(true);
      }, delay);
    }

    const setupPeer = (activeSocket: Awaited<ReturnType<typeof getSocket>>) => {
      pcRef.current?.close();
      pendingIceCandidates = [];
      remoteStreamRef.current = null;
      setRemoteStream(null);

      const pc = createPeerConnection((candidate) => {
        activeSocket.emit("signal", { to: "host", data: { type: "ice", candidate } });
      });

      pc.ontrack = (event) => {
        const inbound = event.streams[0] ?? new MediaStream([event.track]);
        inbound.getVideoTracks().forEach((track) => {
          track.enabled = !audioOnlyRef.current;
        });
        remoteStreamRef.current = inbound;
        setRemoteStream(inbound);
        setConnectionState("connected");
        setError(null);
        clearRetryTimer();
      };

      pc.onconnectionstatechange = () => {
        if (pc !== pcRef.current || cancelled) {
          return;
        }
        if (pc.connectionState === "connected") {
          setConnectionState("connected");
          setError(null);
          clearRetryTimer();
        }
        if (pc.connectionState === "failed") {
          scheduleRetry(250);
        }
        if (pc.connectionState === "disconnected") {
          scheduleRetry(3_000);
        }
      };

      pcRef.current = pc;
    };

    function joinViewer(isRetry: boolean) {
      const activeSocket = socket;
      if (!activeSocket || cancelled) {
        return;
      }

      clearRetryTimer();
      setupPeer(activeSocket);
      setConnectionState(isRetry ? "retrying" : "connecting");
      setError(null);

      activeSocket.emit(
        "join-as-viewer",
        { streamId, sessionId },
        (result: { ok: boolean; error?: string }) => {
          if (cancelled) {
            return;
          }
          if (!result?.ok) {
            failConnection(result?.error ?? "Could not join this stream.");
            return;
          }
          scheduleRetry(CONNECT_RETRY_DELAY_MS);
        },
      );
    }

    const onSignal = async ({ data }: SignalIn) => {
      const pc = pcRef.current;
      const activeSocket = socket;
      if (!pc || !activeSocket) {
        return;
      }

      try {
        if (data.type === "offer" && data.sdp) {
          await pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
          await flushIceCandidates(pc, pendingIceCandidates);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          activeSocket.emit("signal", { to: "host", data: { type: "answer", sdp: answer.sdp } });
          if (audioOnlyRef.current) {
            activeSocket.emit("signal", { to: "host", data: { type: "consume-mode", audioOnly: true } });
          }
          return;
        }
        if (data.type === "ice") {
          await addOrQueueIceCandidate(pc, pendingIceCandidates, data.candidate);
          return;
        }
        if (data.type === "paused") {
          setPaused(data.paused);
        }
      } catch {
        scheduleRetry(250);
      }
    };

    const onEnded = () => {
      clearRetryTimer();
      setEnded(true);
      pcRef.current?.close();
    };

    const onCount = ({ viewerCount: next }: { viewerCount: number }) => {
      setViewerCount(next);
    };

    const onHostDisconnected = () => {
      clearRetryTimer();
      setConnectionState("retrying");
      setError("The creator dropped offline. Waiting to reconnect…");
    };

    const onHostReady = () => {
      setError(null);
      setEnded(false);
      setConnectionState("connecting");
      scheduleRetry(CONNECT_RETRY_DELAY_MS);
    };

    const onViewerReplaced = () => {
      failConnection("This viewer session is now active in another tab.");
      pcRef.current?.close();
    };

    const onConnect = () => {
      joinViewer(retryAttempts > 0);
    };

    const onDisconnect = () => {
      clearRetryTimer();
      setConnectionState("retrying");
      setError("Reconnecting to the signaling service…");
    };

    const onConnectError = () => {
      setConnectionState("retrying");
      setError("Could not reach the signaling service. Retrying…");
    };

    void (async () => {
      socket = await getSocket();
      if (cancelled) {
        return;
      }

      socket.on("signal", onSignal);
      socket.on("stream-ended", onEnded);
      socket.on("host-disconnected", onHostDisconnected);
      socket.on("host-ready", onHostReady);
      socket.on("viewer-replaced", onViewerReplaced);
      socket.on("viewer-count", onCount);
      socket.on("connect", onConnect);
      socket.on("disconnect", onDisconnect);
      socket.on("connect_error", onConnectError);

      if (socket.connected) {
        joinViewer(false);
      }
    })();

    return () => {
      cancelled = true;
      clearRetryTimer();
      if (socket) {
        socket.off("signal", onSignal);
        socket.off("stream-ended", onEnded);
        socket.off("host-disconnected", onHostDisconnected);
        socket.off("host-ready", onHostReady);
        socket.off("viewer-replaced", onViewerReplaced);
        socket.off("viewer-count", onCount);
        socket.off("connect", onConnect);
        socket.off("disconnect", onDisconnect);
        socket.off("connect_error", onConnectError);
        socket.emit("leave-stream");
      }
      pcRef.current?.close();
      pcRef.current = null;
    };
  }, [enabled, restartNonce, streamId]);

  return {
    remoteStream,
    viewerCount,
    audioOnly,
    setAudioOnly: applyAudioOnly,
    paused,
    ended,
    error,
    connectionState,
    retry,
  };
}
