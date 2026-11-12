import { randomBytes } from "node:crypto";
import { hashOwnerToken, ownerTokenMatches } from "@/lib/owner-token";

export type StreamAccess = {
  isPrivate: boolean;
  accessTokenHash: string | null;
  ownerTokenHash: string;
};

export function createAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashAccessToken(token: string): string {
  return hashOwnerToken(token);
}

export function canReadStream(
  stream: StreamAccess,
  accessToken: string | null = null,
  ownerToken: string | null = null,
): boolean {
  if (!stream.isPrivate) return true;
  if (ownerToken && ownerTokenMatches(ownerToken, stream.ownerTokenHash)) return true;
  return Boolean(accessToken && stream.accessTokenHash &&
    ownerTokenMatches(accessToken, stream.accessTokenHash));
}
