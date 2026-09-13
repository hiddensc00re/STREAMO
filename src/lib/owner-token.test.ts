import { describe, expect, it } from "vitest";
import { createOwnerToken, hashOwnerToken, ownerTokenMatches } from "./owner-token";

describe("owner tokens", () => {
  it("accepts the original token and rejects others", () => {
    const token = createOwnerToken();
    const hash = hashOwnerToken(token);
    expect(ownerTokenMatches(token, hash)).toBe(true);
    expect(ownerTokenMatches("not-the-token-value-here", hash)).toBe(false);
  });
});
