import { createServer } from "node:http";
import { Server } from "socket.io";
import "dotenv/config";
import { SlidingWindowLimiter } from "../src/lib/rate-limit";

type Role = "host" | "viewer";

type SocketData = {
  role?: Role;
  streamId?: string;
  sessionId?: string;
  ip: string;
};

type SignalPayload = {
  to: string;
  data:
    | { type: "offer"; sdp: string }
    | { type: "answer"; sdp: string }
    | { type: "ice"; candidate: RTCIceCandidateInit }
    | { type: "consume-mode"; audioOnly: boolean }
    | { type: "paused"; paused: boolean }
    | { type: "ended" };
};

const PORT = Number(process.env.PORT ?? process.env.SIGNALING_PORT ?? 4001);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ?? "";

const connectLimiter = new SlidingWindowLimiter(20, 60_000);
const joinLimiter = new SlidingWindowLimiter(12, 60_000);
const signalLimiter = new SlidingWindowLimiter(80, 10_000);

const rooms = new Map<
  string,
  {
    hostSocketId?: string;
    viewers: Map<string, string>;
  }
>();
const hostDisconnectTimers = new Map<string, NodeJS.Timeout>();

function cancelHostDisconnectTimer(streamId: string) {
  const timer = hostDisconnectTimers.get(streamId);
  if (timer) {
    clearTimeout(timer);
    hostDisconnectTimers.delete(streamId);
  }
}

function getRoom(streamId: string) {
  let room = rooms.get(streamId);
  if (!room) {
    room = { viewers: new Map() };
    rooms.set(streamId, room);
  }
  return room;
}

function clientIp(socket: { handshake: { address: string; headers: { [key: string]: string | string[] | undefined } } }): string {
  const forwarded = socket.handshake.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0]?.trim() || socket.handshake.address;
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0];
  }
  return socket.handshake.address;
}

async function persistViewerCount(streamId: string, viewerCount: number, isLive?: boolean) {
  if (!INTERNAL_API_SECRET) {
    return;
  }

  try {
    await fetch(`${APP_URL}/api/streams/${streamId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": INTERNAL_API_SECRET,
      },
      body: JSON.stringify({
        ownerToken: "internal-signaling",
        viewerCount,
        ...(typeof isLive === "boolean" ? { isLive } : {}),
      }),
    });
  } catch (error) {
    console.error("Failed to persist viewer count", error);
  }
}

function broadcastCount(io: Server, streamId: string) {
  const room = rooms.get(streamId);
  const viewerCount = room?.viewers.size ?? 0;
  io.to(`stream:${streamId}`).emit("viewer-count", { streamId, viewerCount });
  io.to("lobby").emit("viewer-count", { streamId, viewerCount });
  void persistViewerCount(streamId, viewerCount);
}

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, service: "streamo-signaling" }));
});

const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGINS,
    methods: ["GET", "POST"],
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
  },
});

setInterval(() => {
  connectLimiter.prune();
  joinLimiter.prune();
  signalLimiter.prune();
}, 30_000);

io.use((socket, next) => {
  const ip = clientIp(socket);
  socket.data.ip = ip;
  if (!connectLimiter.consume(`conn:${ip}`)) {
    next(new Error("Rate limited"));
    return;
  }
  next();
});

io.on("connection", (socket) => {
  socket.on("join-lobby", () => {
    socket.join("lobby");
  });

  socket.on("join-as-host", async (payload: { streamId?: string; ownerToken?: string }, ack?: (result: { ok: boolean; error?: string }) => void) => {
    const streamId = payload?.streamId;
    const ownerToken = payload?.ownerToken;
    if (!streamId || !ownerToken) {
      ack?.({ ok: false, error: "Missing host credentials." });
      return;
    }

    try {
      const response = await fetch(`${APP_URL}/api/streams/${streamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerToken, isLive: true }),
      });
      if (!response.ok) {
        ack?.({ ok: false, error: "Could not claim this stream." });
        return;
      }
    } catch {
      ack?.({ ok: false, error: "Could not reach the stream directory." });
      return;
    }

    const room = getRoom(streamId);
    cancelHostDisconnectTimer(streamId);
    if (room.hostSocketId && room.hostSocketId !== socket.id) {
      io.to(room.hostSocketId).emit("host-replaced");
    }

    room.hostSocketId = socket.id;
    socket.data.role = "host";
    socket.data.streamId = streamId;
    socket.join(`stream:${streamId}`);
    ack?.({ ok: true });
    io.to("lobby").emit("stream-live", { streamId });
    broadcastCount(io, streamId);

    for (const [sessionId, viewerSocketId] of room.viewers) {
      socket.emit("viewer-joined", { sessionId });
      io.to(viewerSocketId).emit("host-ready");
    }
  });

  socket.on("join-as-viewer", (payload: { streamId?: string; sessionId?: string }, ack?: (result: { ok: boolean; error?: string }) => void) => {
    const streamId = payload?.streamId;
    const sessionId = payload?.sessionId;
    if (!streamId || !sessionId) {
      ack?.({ ok: false, error: "Missing viewer session." });
      return;
    }
    if (!joinLimiter.consume(`join:${socket.data.ip}:${streamId}`)) {
      ack?.({ ok: false, error: "Too many join attempts. Slow down." });
      return;
    }

    const room = getRoom(streamId);
    if (room.viewers.has(sessionId) && room.viewers.get(sessionId) !== socket.id) {
      ack?.({ ok: false, error: "This session is already connected." });
      return;
    }

    room.viewers.set(sessionId, socket.id);
    socket.data.role = "viewer";
    socket.data.streamId = streamId;
    socket.data.sessionId = sessionId;
    socket.join(`stream:${streamId}`);
    ack?.({ ok: true, error: undefined });

    if (room.hostSocketId) {
      io.to(room.hostSocketId).emit("viewer-joined", { sessionId });
    }
    broadcastCount(io, streamId);
  });

  socket.on("signal", (payload: SignalPayload) => {
    if (!signalLimiter.consume(`sig:${socket.id}`)) {
      return;
    }
    const streamId = socket.data.streamId;
    if (!streamId || !payload?.to || !payload.data) {
      return;
    }
    const room = rooms.get(streamId);
    if (!room) {
      return;
    }

    let targetSocketId: string | undefined;
    if (socket.data.role === "host") {
      targetSocketId = room.viewers.get(payload.to);
    } else if (socket.data.role === "viewer" && socket.data.sessionId) {
      if (payload.to !== "host") {
        return;
      }
      targetSocketId = room.hostSocketId;
    }

    if (!targetSocketId) {
      return;
    }

    io.to(targetSocketId).emit("signal", {
      from: socket.data.role === "host" ? "host" : socket.data.sessionId,
      data: payload.data,
    });
  });

  socket.on("leave-stream", () => {
    cleanupSocket(socket.id, socket.data);
  });

  socket.on("end-stream", async () => {
    const streamId = socket.data.streamId;
    if (socket.data.role !== "host" || !streamId) {
      return;
    }
    io.to(`stream:${streamId}`).emit("stream-ended", { streamId });
    io.to("lobby").emit("stream-ended", { streamId });
    cancelHostDisconnectTimer(streamId);
    await persistViewerCount(streamId, 0, false);
    rooms.delete(streamId);
  });

  socket.on("disconnect", () => {
    cleanupSocket(socket.id, socket.data);
  });
});

function cleanupSocket(socketId: string, data: SocketData) {
  const streamId = data.streamId;
  if (!streamId) {
    return;
  }
  const room = rooms.get(streamId);
  if (!room) {
    return;
  }

  if (data.role === "host" && room.hostSocketId === socketId) {
    room.hostSocketId = undefined;
    io.to(`stream:${streamId}`).emit("host-disconnected");
    io.to("lobby").emit("host-disconnected", { streamId });
    cancelHostDisconnectTimer(streamId);
    const timer = setTimeout(() => {
      hostDisconnectTimers.delete(streamId);
      const currentRoom = rooms.get(streamId);
      if (currentRoom?.hostSocketId) {
        return;
      }
      io.to(`stream:${streamId}`).emit("stream-ended", { streamId });
      io.to("lobby").emit("stream-ended", { streamId });
      void persistViewerCount(streamId, 0, false);
      rooms.delete(streamId);
    }, 15_000);
    hostDisconnectTimers.set(streamId, timer);
  }

  if (data.role === "viewer" && data.sessionId) {
    if (room.viewers.get(data.sessionId) === socketId) {
      room.viewers.delete(data.sessionId);
      if (room.hostSocketId) {
        io.to(room.hostSocketId).emit("viewer-left", { sessionId: data.sessionId });
      }
      broadcastCount(io, streamId);
    }
  }

  if (!room.hostSocketId && room.viewers.size === 0 && !hostDisconnectTimers.has(streamId)) {
    rooms.delete(streamId);
  }
}

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`STREAMO signaling listening on ${PORT}`);
});
