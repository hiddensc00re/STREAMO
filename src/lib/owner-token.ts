import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function createOwnerToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOwnerToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function ownerTokenMatches(token: string, hash: string): boolean {
  const incoming = Buffer.from(hashOwnerToken(token), "hex");
  const stored = Buffer.from(hash, "hex");
  if (incoming.length !== stored.length) {
    return false;
  }
  return timingSafeEqual(incoming, stored);
}
