"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";
import { createPeerConnection, replaceSenderTrack } from "@/lib/media-client";
import { addOrQueueIceCandidate, flushIceCandidates } from "@/lib/ice-candidates";

type SignalIn = {
  from: string;
  data:
    | { type: "answer"; sdp: string }
    | { type: "ice"; candidate: RTCIceCandidateInit }
    | { type: "consume-mode"; audioOnly: boolean };
};

export function useHostPeers(streamId: string | undefined, ownerToken: string | undefined) {
  const [viewerCount, setViewerCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const outboundRef = useRef<MediaStream | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const audioOnlyViewers = useRef(new Set<string>());
  const pendingIceCandidates = useRef(new Map<string, RTCIceCandidateInit[]>());

  const attachStream = useCallback((stream: MediaStream | null) => {
    outboundRef.current = stream;
    videoTrackRef.current = stream?.getVideoTracks()[0] ?? null;
    const audioTrack = stream?.getAudioTracks()[0] ?? null;

    for (const [sessionId, pc] of peersRef.current) {
      void replaceSenderTrack(
        [pc],
        "video",
        audioOnlyViewers.current.has(sessionId) ? null : videoTrackRef.current,
      );
      void replaceSenderTrack([pc], "audio", audioTrack);
    }
  }, []);

  const offerToViewer = useCallback(async (sessionId: string) => {
    try {
      const socket = await getSocket();
      const existing = peersRef.current.get(sessionId);
      existing?.close();
      pendingIceCandidates.current.set(sessionId, []);

      const pc = createPeerConnection((candidate) => {
        socket.emit("signal", { to: sessionId, data: { type: "ice", candidate } });
      });

      const stream = outboundRef.current;
      if (stream) {
        for (const track of stream.getTracks()) {
          const sendTrack =
            track.kind === "video" && audioOnlyViewers.current.has(sessionId) ? null : track;
          if (sendTrack) {
            pc.addTrack(sendTrack, stream);
          } else {
            pc.addTransceiver("video", { direction: "sendonly" });
          }
        }
      } else {
        pc.addTransceiver("video", { direction: "sendonly" });
        pc.addTransceiver("audio", { direction: "sendonly" });
      }

      peersRef.current.set(sessionId, pc);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("signal", { to: sessionId, data: { type: "offer", sdp: offer.sdp } });
    } catch {
      setError("Could not negotiate a connection with a viewer. Waiting for it to retry…");
    }
  }, []);

  useEffect(() => {
    if (!streamId || !ownerToken) {
      return;
    }

    let cancelled = false;
    let socket: Awaited<ReturnType<typeof getSocket>> | undefined;
    let onViewerJoined: ((payload: { sessionId: string }) => void) | undefined;
    let onViewerLeft: ((payload: { sessionId: string }) => void) | undefined;
    let onSignal: ((payload: SignalIn) => void) | undefined;
    let onCount: ((payload: { viewerCount: number }) => void) | undefined;
    let onConnect: (() => void) | undefined;
    let onDisconnect: (() => void) | undefined;
    let onConnectError: (() => void) | undefined;
    const candidateQueues = pendingIceCandidates.current;

    void (async () => {
      socket = await getSocket();
      if (cancelled) {
        return;
      }

      onViewerJoined = ({ sessionId }: { sessionId: string }) => {
        void offerToViewer(sessionId);
      };

      onViewerLeft = ({ sessionId }: { sessionId: string }) => {
        peersRef.current.get(sessionId)?.close();
        peersRef.current.delete(sessionId);
        pendingIceCandidates.current.delete(sessionId);
        audioOnlyViewers.current.delete(sessionId);
      };

      onSignal = async ({ from, data }: SignalIn) => {
        const pc = peersRef.current.get(from);
        if (!pc) {
          return;
        }
        if (data.type === "answer" && data.sdp) {
          try {
            await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
            await flushIceCandidates(pc, pendingIceCandidates.current.get(from) ?? []);
            setError(null);
          } catch {
            setError("A viewer could not complete media negotiation. Waiting for it to retry…");
          }
        }
        if (data.type === "ice") {
          try {
            let queue = pendingIceCandidates.current.get(from);
            if (!queue) {
              queue = [];
              pendingIceCandidates.current.set(from, queue);
            }
            await addOrQueueIceCandidate(pc, queue, data.candidate);
          } catch {
            setError("A viewer network candidate was rejected. Waiting for it to retry…");
          }
        }
        if (data.type === "consume-mode") {
          if (data.audioOnly) {
            audioOnlyViewers.current.add(from);
            await replaceSenderTrack([pc], "video", null);
          } else {
            audioOnlyViewers.current.delete(from);
            await replaceSenderTrack([pc], "video", videoTrackRef.current);
          }
        }
      };

      onCount = ({ viewerCount: next }: { viewerCount: number }) => {
        setViewerCount(next);
      };

      socket.on("viewer-joined", onViewerJoined);
      socket.on("viewer-left", onViewerLeft);
      socket.on("signal", onSignal);
      socket.on("viewer-count", onCount);

      const joinHost = () => {
        socket?.emit("join-as-host", { streamId, ownerToken }, (result: { ok: boolean; error?: string }) => {
          if (!result?.ok) {
            setError(result?.error ?? "Could not start broadcasting.");
            setConnected(false);
            return;
          }
          setConnected(true);
          setError(null);
        });
      };

      onConnect = joinHost;
      onDisconnect = () => {
        setConnected(false);
        setError("Reconnecting the broadcast signaling service…");
      };
      onConnectError = () => {
        setConnected(false);
        setError("Could not reach the broadcast signaling service. Retrying…");
      };

      socket.on("connect", onConnect);
      socket.on("disconnect", onDisconnect);
      socket.on("connect_error", onConnectError);

      if (socket.connected) {
        joinHost();
      }
    })();

    const peers = peersRef.current;
    return () => {
      cancelled = true;
      if (socket) {
        if (onViewerJoined) socket.off("viewer-joined", onViewerJoined);
        if (onViewerLeft) socket.off("viewer-left", onViewerLeft);
        if (onSignal) socket.off("signal", onSignal);
        if (onCount) socket.off("viewer-count", onCount);
        if (onConnect) socket.off("connect", onConnect);
        if (onDisconnect) socket.off("disconnect", onDisconnect);
        if (onConnectError) socket.off("connect_error", onConnectError);
        socket.emit("leave-stream");
      }
      for (const pc of peers.values()) {
        pc.close();
      }
      peers.clear();
      candidateQueues.clear();
    };
  }, [streamId, ownerToken, offerToViewer]);

  const endStream = useCallback(() => {
    void getSocket().then((socket) => socket.emit("end-stream"));
    for (const pc of peersRef.current.values()) {
      pc.close();
    }
    peersRef.current.clear();
  }, []);

  const setPaused = useCallback((paused: boolean) => {
    void getSocket().then((socket) => {
      for (const sessionId of peersRef.current.keys()) {
        socket.emit("signal", { to: sessionId, data: { type: "paused", paused } });
      }
    });
    outboundRef.current?.getTracks().forEach((track) => {
      track.enabled = !paused;
    });
  }, []);

  return { viewerCount, connected, error, attachStream, endStream, setPaused, peersRef };
}
