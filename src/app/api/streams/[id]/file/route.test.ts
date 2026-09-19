import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashOwnerToken } from "@/lib/owner-token";

const mocks = vi.hoisted(() => ({
  stream: { findUnique: vi.fn(), update: vi.fn() },
  fileBroadcast: { findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
  bucket: { createSignedUploadUrl: vi.fn(), info: vi.fn(), remove: vi.fn() },
  lock: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { stream: mocks.stream, fileBroadcast: mocks.fileBroadcast, $transaction: (run: (tx: unknown) => unknown) => run({ ...mocks, $executeRaw: mocks.lock }) } }));
vi.mock("@/lib/storage-server", () => ({ mediaBucket: () => mocks.bucket }));
import { POST } from "./route";
const token = "owner-token-for-test-123456789";
const id = "testevent123";
const call = (body: unknown, auth = token) => POST(new Request("https://streamo.test/api/file", { method: "POST", headers: { authorization: `Bearer ${auth}`, "content-type": "application/json", "x-forwarded-for": crypto.randomUUID() }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.stream.findUnique.mockResolvedValue({ id, streamType: "file", ownerTokenHash: hashOwnerToken(token) });
  mocks.fileBroadcast.findUnique.mockResolvedValue(null);
  mocks.fileBroadcast.count.mockResolvedValue(0);
});
describe("file owner controls", () => {
  it("rejects a forged owner token before accessing storage", async () => {
    expect((await call({ action: "prepare", name: "x.mp4", mime: "video/mp4", size: 100 }, "wrong")).status).toBe(403);
    expect(mocks.bucket.createSignedUploadUrl).not.toHaveBeenCalled();
  });
  it("rejects full free storage without issuing an upload ticket", async () => {
    mocks.fileBroadcast.count.mockResolvedValue(18);
    expect((await call({ action: "prepare", name: "x.mp4", mime: "video/mp4", size: 100 })).status).toBe(409);
    expect(mocks.bucket.createSignedUploadUrl).not.toHaveBeenCalled();
  });
  it("reserves a unique object with overwrite disabled", async () => {
    mocks.fileBroadcast.create.mockImplementation(async ({ data }) => data);
    mocks.bucket.createSignedUploadUrl.mockResolvedValue({ data: { signedUrl: "https://storage.test/signed" }, error: null });
    expect((await call({ action: "prepare", name: "x.mp4", mime: "video/mp4", size: 100 })).status).toBe(200);
    expect(mocks.bucket.createSignedUploadUrl).toHaveBeenCalledWith(expect.stringMatching(/^testevent123\//), { upsert: false });
    expect(mocks.lock).toHaveBeenCalled();
  });
  it("does not finalize an object with a different actual size", async () => {
    mocks.fileBroadcast.findUnique.mockResolvedValue({ status: "uploading", path: "known", size: 100, mime: "video/mp4" });
    mocks.bucket.info.mockResolvedValue({ data: { size: 200, contentType: "video/mp4" }, error: null });
    expect((await call({ action: "complete", duration: 30 })).status).toBe(400);
    expect(mocks.fileBroadcast.update).not.toHaveBeenCalled();
  });
  it("prevents deletion while an upload URL could still restore an object", async () => {
    mocks.fileBroadcast.findUnique.mockResolvedValue({ status: "ready", uploadUntil: new Date(Date.now() + 60000) });
    expect((await call({ action: "remove" })).status).toBe(409);
    expect(mocks.bucket.remove).not.toHaveBeenCalled();
  });
  it("pauses at server time, not a client-supplied position", async () => {
    mocks.fileBroadcast.findUnique.mockResolvedValue({ status: "playing", duration: 100, position: 10, anchor: new Date(Date.now() - 5000) });
    expect((await call({ action: "pause", position: 999 })).status).toBe(200);
    const update = mocks.fileBroadcast.update.mock.calls[0][0].data;
    expect(update.status).toBe("paused");
    expect(update.position).toBeGreaterThanOrEqual(15);
    expect(update.position).toBeLessThan(16);
  });
});
