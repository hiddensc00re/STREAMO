export type PublicStream = {
  id: string;
  title: string;
  streamerName: string;
  streamType: "live_camera" | "file";
  hasVideo: boolean;
  hasAudio: boolean;
  isLive: boolean;
  viewerCount: number;
  scheduledAt: string | null;
  createdAt: string;
  endedAt: string | null;
};

export type CreateStreamResponse = PublicStream & {
  ownerToken: string;
};

export const OWNER_TOKEN_STORAGE_PREFIX = "streamo:owner:";
export const SESSION_ID_KEY = "streamo:session-id";
export const DISPLAY_NAME_KEY = "streamo:display-name";

export function getOrCreateSessionId(): string {
  if (typeof window === "undefined") {
    return "";
  }
  const existing = sessionStorage.getItem(SESSION_ID_KEY);
  if (existing) {
    return existing;
  }
  const id = crypto.randomUUID();
  sessionStorage.setItem(SESSION_ID_KEY, id);
  return id;
}
