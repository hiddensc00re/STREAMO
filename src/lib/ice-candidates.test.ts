import { describe, expect, it, vi } from "vitest";
import { addOrQueueIceCandidate, flushIceCandidates } from "@/lib/ice-candidates";

function candidate(value: string): RTCIceCandidateInit {
  return { candidate: value, sdpMid: "0", sdpMLineIndex: 0 };
}

describe("ICE candidate buffering", () => {
  it("queues candidates until a remote description exists", async () => {
    const queue: RTCIceCandidateInit[] = [];
    const addIceCandidate = vi.fn(async () => undefined);
    const peer = { remoteDescription: null, addIceCandidate };
    const first = candidate("candidate:first");

    await addOrQueueIceCandidate(peer, queue, first);

    expect(queue).toEqual([first]);
    expect(addIceCandidate).not.toHaveBeenCalled();
  });

  it("flushes queued candidates in arrival order", async () => {
    const first = candidate("candidate:first");
    const second = candidate("candidate:second");
    const queue = [first, second];
    const addIceCandidate = vi.fn(async () => undefined);
    const peer = {
      remoteDescription: { type: "offer", sdp: "offer" } as RTCSessionDescription,
      addIceCandidate,
    };

    await flushIceCandidates(peer, queue);

    expect(queue).toEqual([]);
    expect(addIceCandidate).toHaveBeenNthCalledWith(1, first);
    expect(addIceCandidate).toHaveBeenNthCalledWith(2, second);
  });

  it("adds candidates immediately after negotiation", async () => {
    const queue: RTCIceCandidateInit[] = [];
    const addIceCandidate = vi.fn(async () => undefined);
    const peer = {
      remoteDescription: { type: "answer", sdp: "answer" } as RTCSessionDescription,
      addIceCandidate,
    };
    const next = candidate("candidate:next");

    await addOrQueueIceCandidate(peer, queue, next);

    expect(queue).toEqual([]);
    expect(addIceCandidate).toHaveBeenCalledWith(next);
  });
});
