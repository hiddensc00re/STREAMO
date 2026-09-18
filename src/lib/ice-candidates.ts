type IceCandidateTarget = Pick<RTCPeerConnection, "remoteDescription" | "addIceCandidate">;

export async function addOrQueueIceCandidate(
  peer: IceCandidateTarget,
  queue: RTCIceCandidateInit[],
  candidate: RTCIceCandidateInit,
): Promise<void> {
  if (!peer.remoteDescription) {
    queue.push(candidate);
    return;
  }

  await peer.addIceCandidate(candidate);
}

export async function flushIceCandidates(
  peer: IceCandidateTarget,
  queue: RTCIceCandidateInit[],
): Promise<void> {
  while (queue.length > 0) {
    const candidate = queue.shift();
    if (candidate) {
      await peer.addIceCandidate(candidate);
    }
  }
}
