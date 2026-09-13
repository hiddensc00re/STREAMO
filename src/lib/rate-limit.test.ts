import { describe, expect, it } from "vitest";
import { SlidingWindowLimiter } from "./rate-limit";

describe("SlidingWindowLimiter", () => {
  it("allows traffic under the limit", () => {
    const limiter = new SlidingWindowLimiter(3, 60_000);
    expect(limiter.consume("a")).toBe(true);
    expect(limiter.consume("a")).toBe(true);
    expect(limiter.consume("a")).toBe(true);
  });

  it("blocks traffic over the limit", () => {
    const limiter = new SlidingWindowLimiter(2, 60_000);
    expect(limiter.consume("b")).toBe(true);
    expect(limiter.consume("b")).toBe(true);
    expect(limiter.consume("b")).toBe(false);
  });

  it("isolates keys", () => {
    const limiter = new SlidingWindowLimiter(1, 60_000);
    expect(limiter.consume("one")).toBe(true);
    expect(limiter.consume("two")).toBe(true);
    expect(limiter.consume("one")).toBe(false);
  });
});
