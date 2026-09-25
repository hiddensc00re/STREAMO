import { beforeEach, describe, expect, it, vi } from "vitest";
const findMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { stream: { findMany } } }));
import { GET } from "./route";
const now = new Date();
const stream = (id: string, overrides = {}) => ({
  id, title: id, streamerName: "Test", streamType: "file", isLive: true,
  hasVideo: true, hasAudio: true, viewerCount: 0, endedAt: null,
  scheduledAt: null, createdAt: now, fileBroadcast: null, ...overrides,
});
const file = (status: string, position = 0) => ({
  status, position, duration: 60, anchor: new Date(Date.now() - 1000),
});
beforeEach(() => vi.clearAllMocks());
describe("live directory", () => {
  it("hides finished and unplayable files while keeping playing, paused and scheduled events", async () => {
    findMany.mockResolvedValue([
      stream("finished", { fileBroadcast: file("ended") }),
      stream("elapsed", { fileBroadcast: file("playing", 60) }),
      stream("missing"),
      stream("uploading", { fileBroadcast: file("uploading") }),
      stream("playing", { fileBroadcast: file("playing") }),
      stream("paused", { fileBroadcast: file("paused", 20) }),
      stream("scheduled", { isLive: false, scheduledAt: new Date(Date.now() + 60000) }),
      stream("camera", { streamType: "live_camera" }),
      stream("ended-camera", { streamType: "live_camera", endedAt: now }),
    ]);
    const body = await (await GET()).json();
    expect(body.streams.map((s: { id: string }) => s.id)).toEqual(["playing", "paused", "scheduled", "camera"]);
    expect(findMany.mock.calls[0][0].where.endedAt).toBeNull();
  });
});
