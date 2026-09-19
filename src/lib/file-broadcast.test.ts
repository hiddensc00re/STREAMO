import { describe, expect, it } from "vitest";
import { fileAction, FILE_LIMIT, playbackPosition } from "./file-broadcast";

describe("file event timing", () => {
  const file = { status: "playing", duration: 120, position: 30, anchor: new Date(10000) };
  it("puts a late viewer at the shared playback position", () => expect(playbackPosition(file, 20000)).toBe(40));
  it("does not advance while paused", () => expect(playbackPosition({ ...file, status: "paused" }, 80000)).toBe(30));
  it("clamps at the end and tolerates an anchor in the future", () => {
    expect(playbackPosition(file, 999999)).toBe(120);
    expect(playbackPosition(file, 0)).toBe(30);
  });
  it("rejects oversized and unsupported uploads and invalid durations", () => {
    expect(fileAction.safeParse({ action: "prepare", name: "clip.mp4", mime: "video/mp4", size: FILE_LIMIT }).success).toBe(true);
    expect(fileAction.safeParse({ action: "prepare", name: "clip.mp4", mime: "video/mp4", size: FILE_LIMIT + 1 }).success).toBe(false);
    expect(fileAction.safeParse({ action: "prepare", name: "page.html", mime: "text/html", size: 100 }).success).toBe(false);
    for (const duration of [0, -1, Infinity, 21601]) expect(fileAction.safeParse({ action: "complete", duration }).success).toBe(false);
  });
});
