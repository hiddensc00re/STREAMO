import { z } from "zod";

export const STREAM_TITLE_MAX = 80;
export const STREAMER_NAME_MAX = 40;

export const streamTypeSchema = z.enum(["live_camera", "file"]);

export const createStreamSchema = z.object({
  title: z.string().min(1).max(STREAM_TITLE_MAX),
  streamerName: z.string().min(1).max(STREAMER_NAME_MAX),
  streamType: streamTypeSchema,
  hasVideo: z.boolean(),
  hasAudio: z.boolean(),
  scheduledAt: z.string().datetime().nullable().optional(),
});

export const updateStreamSchema = z.object({
  ownerToken: z.string().min(16),
  isLive: z.boolean().optional(),
  hasVideo: z.boolean().optional(),
  hasAudio: z.boolean().optional(),
  viewerCount: z.number().int().min(0).optional(),
});

export const iceServers: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

export function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [...iceServers];
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  }
  return servers;
}

export const RESOLUTION_PRESETS = {
  "720p": { width: 1280, height: 720, frameRate: 30 },
  "480p": { width: 854, height: 480, frameRate: 30 },
  "360p": { width: 640, height: 360, frameRate: 24 },
} as const;

export type ResolutionPreset = keyof typeof RESOLUTION_PRESETS;
