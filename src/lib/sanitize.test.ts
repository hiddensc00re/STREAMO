import { describe, expect, it } from "vitest";
import { looksSafeId, sanitizeText } from "./sanitize";

describe("sanitizeText", () => {
  it("strips markup and control characters", () => {
    expect(sanitizeText('Hello <script>alert("x")</script>', 80)).toBe("Hello scriptalert(x)/script");
    expect(sanitizeText("  Live   jazz\u0000  ", 80)).toBe("Live jazz");
  });

  it("caps length", () => {
    expect(sanitizeText("abcdefghij", 4)).toBe("abcd");
  });

  it("rejects non-strings", () => {
    expect(sanitizeText(12, 10)).toBe("");
  });
});

describe("looksSafeId", () => {
  it("accepts cuid-like ids", () => {
    expect(looksSafeId("clxyz1234567890abcd")).toBe(true);
  });

  it("rejects injection payloads", () => {
    expect(looksSafeId("../etc/passwd")).toBe(false);
    expect(looksSafeId("a")).toBe(false);
  });
});
