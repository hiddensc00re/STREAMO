"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";
import { createPeerConnection } from "@/lib/media-client";
import { getOrCreateSessionId } from "@/lib/types";

type SignalIn = {
  from: string;
  data:
    | { type: "offer"; sdp: string }
    | { type: "ice"; candidate: RTCIceCandidateInit }
    | { type: "paused"; paused: boolean }
    | { type: "ended" };
};

export function useViewerPeer(streamId: string | undefined) {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [audioOnly, setAudioOnly] = useState(false);
  const [paused, setPaused] = useState(false);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const audioOnlyRef = useRef(false);

  const applyAudioOnly = useCallback((enabled: boolean) => {
    audioOnlyRef.current = enabled;
    setAudioOnly(enabled);
    const stream = remoteStream;
    stream?.getVideoTracks().forEach((track) => {
      track.enabled = !enabled;
    });
    void getSocket().then((socket) => {
      socket.emit("signal", {
        to: "host",
        data: { type: "consume-mode", audioOnly: enabled },
      });
    });
  }, [remoteStream]);

  useEffect(() => {
    if (!streamId) {
      return;
    }

    let cancelled = false;
    let socket: Awaited<ReturnType<typeof getSocket>> | undefined;

    const sessionId = getOrCreateSessionId();

    const setupPeer = (activeSocket: Awaited<ReturnType<typeof getSocket>>) => {
      pcRef.current?.close();
      const pc = createPeerConnection((candidate) => {
        activeSocket.emit("signal", { to: "host", data: { type: "ice", candidate } });
      });
      pc.ontrack = (event) => {
        const inbound = event.streams[0] ?? new MediaStream([event.track]);
        inbound.getVideoTracks().forEach((track) => {
          track.enabled = !audioOnlyRef.current;
        });
        setRemoteStream(inbound);
      };
      pcRef.current = pc;
    };

    const onSignal = async ({ data }: SignalIn) => {
      const pc = pcRef.current;
      const activeSocket = socket;
      if (!pc || !activeSocket) {
        return;
      }
      if (data.type === "offer" && data.sdp) {
        await pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        activeSocket.emit("signal", { to: "host", data: { type: "answer", sdp: answer.sdp } });
        if (audioOnlyRef.current) {
          activeSocket.emit("signal", { to: "host", data: { type: "consume-mode", audioOnly: true } });
        }
      }
      if (data.type === "ice") {
        try {
          await pc.addIceCandidate(data.candidate);
        } catch {
          // Candidate may arrive before remote description.
        }
      }
      if (data.type === "paused") {
        setPaused(data.paused);
      }
    };

    const onEnded = () => {
      setEnded(true);
      pcRef.current?.close();
    };

    const onCount = ({ viewerCount: next }: { viewerCount: number }) => {
      setViewerCount(next);
    };

    const onHostDisconnected = () => {
      setError("The creator dropped offline. Waiting to reconnect…");
    };

    const onHostReady = () => {
      if (socket) {
        setError(null);
        setEnded(false);
        setupPeer(socket);
      }
    };

    void (async () => {
      socket = await getSocket();
      if (cancelled) {
        return;
      }
      setupPeer(socket);
      socket.on("signal", onSignal);
      socket.on("stream-ended", onEnded);
      socket.on("host-disconnected", onHostDisconnected);
      socket.on("host-ready", onHostReady);
      socket.on("viewer-count", onCount);
      socket.emit("join-as-viewer", { streamId, sessionId }, (result: { ok: boolean; error?: string }) => {
        if (!result?.ok) {
          setError(result?.error ?? "Could not join this stream.");
        }
      });
    })();

    return () => {
      cancelled = true;
      if (socket) {
        socket.off("signal", onSignal);
        socket.off("stream-ended", onEnded);
        socket.off("host-disconnected", onHostDisconnected);
        socket.off("host-ready", onHostReady);
        socket.off("viewer-count", onCount);
        socket.emit("leave-stream");
      }
      pcRef.current?.close();
      pcRef.current = null;
    };
  }, [streamId]);

  return {
    remoteStream,
    viewerCount,
    audioOnly,
    setAudioOnly: applyAudioOnly,
    paused,
    ended,
    error,
  };
}
