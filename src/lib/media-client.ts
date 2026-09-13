"use client";

import { getIceServers, RESOLUTION_PRESETS, type ResolutionPreset } from "@/lib/media";

export async function getCameraStream(
  resolution: ResolutionPreset,
  opts: { video: boolean; audio: boolean },
): Promise<MediaStream> {
  const preset = RESOLUTION_PRESETS[resolution];
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: opts.video
        ? {
            width: { ideal: preset.width },
            height: { ideal: preset.height },
            frameRate: { ideal: preset.frameRate },
            facingMode: "user",
          }
        : false,
      audio: opts.audio
        ? {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        : false,
    });
  } catch (error) {
    throw toPermissionError(error);
  }
}

export function captureFileStream(video: HTMLVideoElement): MediaStream {
  const media = video as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
  const stream = media.captureStream?.() ?? media.mozCaptureStream?.();
  if (!stream) {
    throw new Error("This browser cannot live-stream a local file. Try Chrome, Edge, or Firefox.");
  }
  return stream;
}

export function permissionMessage(kind: "camera" | "microphone" | "both"): string {
  if (kind === "camera") {
    return "Camera access was blocked. Allow camera permissions in your browser settings and try again.";
  }
  if (kind === "microphone") {
    return "Microphone access was blocked. Allow microphone permissions in your browser settings and try again.";
  }
  return "Camera or microphone access was blocked. Allow permissions in your browser settings and try again.";
}

function toPermissionError(error: unknown): Error {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return new Error(permissionMessage("both"));
  }
  if (name === "NotFoundError") {
    return new Error("No camera or microphone was found on this device.");
  }
  if (name === "NotReadableError") {
    return new Error("Your camera or microphone is already in use by another application.");
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error("Could not access camera or microphone.");
}

export function stopMediaStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export async function replaceSenderTrack(
  connections: Iterable<RTCPeerConnection>,
  kind: "audio" | "video",
  track: MediaStreamTrack | null,
): Promise<void> {
  for (const pc of connections) {
    const sender = pc.getSenders().find((item) => {
      if (item.track?.kind === kind) {
        return true;
      }
      const transceiver = pc.getTransceivers().find((entry) => entry.sender === item);
      return transceiver?.receiver.track.kind === kind || transceiver?.mid === kind;
    });
    if (sender) {
      await sender.replaceTrack(track);
    }
  }
}

export function createPeerConnection(onIce: (candidate: RTCIceCandidate) => void): RTCPeerConnection {
  const pc = new RTCPeerConnection({ iceServers: getIceServers() });
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      onIce(event.candidate);
    }
  };
  return pc;
}
