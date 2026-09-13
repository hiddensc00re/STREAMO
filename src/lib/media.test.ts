import { describe, expect, it } from "vitest";
import { createStreamSchema } from "./media";

describe("createStreamSchema", () => {
  it("accepts a camera event", () => {
    const parsed = createStreamSchema.parse({
      title: "Park session",
      streamerName: "Alex",
      streamType: "live_camera",
      hasVideo: true,
      hasAudio: true,
    });
    expect(parsed.streamType).toBe("live_camera");
  });

  it("rejects unknown stream types", () => {
    const parsed = createStreamSchema.safeParse({
      title: "Park session",
      streamerName: "Alex",
      streamType: "obs",
      hasVideo: true,
      hasAudio: true,
    });
    expect(parsed.success).toBe(false);
  });
});
