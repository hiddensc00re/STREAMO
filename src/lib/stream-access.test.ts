import { describe, expect, it } from "vitest";
import { canReadStream, createAccessToken, hashAccessToken } from "./stream-access";
import { hashOwnerToken } from "./owner-token";

const ownerToken = "owner-test-token-long-enough-to-be-safe";
const accessToken = createAccessToken();
const privateEvent = {
  isPrivate: true,
  accessTokenHash: hashAccessToken(accessToken),
  ownerTokenHash: hashOwnerToken(ownerToken),
};

describe("private STREAMO events", () => {
  it("generates unguessable sharing tokens", () => {
    expect(createAccessToken()).not.toBe(createAccessToken());
    expect(accessToken.length).toBeGreaterThanOrEqual(40);
  });
  it("allows only the current link or owner token", () => {
    expect(canReadStream(privateEvent)).toBe(false);
    expect(canReadStream(privateEvent, "incorrect")).toBe(false);
    expect(canReadStream(privateEvent, accessToken)).toBe(true);
    expect(canReadStream(privateEvent, null, ownerToken)).toBe(true);
  });
  it("revokes older tokens when replaced", () => {
    const rotated = { ...privateEvent, accessTokenHash: hashAccessToken(createAccessToken()) };
    expect(canReadStream(rotated, accessToken)).toBe(false);
  });
  it("keeps public events accessible", () => {
    expect(canReadStream({ ...privateEvent, isPrivate: false })).toBe(true);
  });
});
