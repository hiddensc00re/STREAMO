# STREAMO

A live WebRTC streaming platform. Creators broadcast from a browser camera or a local media file. Viewers join instantly and can switch to **audio only** so the host stops sending video to that peer.

No accounts. No OBS. No uploads to a media bucket.

## Local setup

### 1. Start PostgreSQL

```bash
docker compose up -d
```

### 2. Environment

```bash
cp .env.example .env
```

### 3. Database

```bash
npx prisma migrate dev --name init
```

### 4. Run the app and signaling server

Use two terminals:

```bash
npm run dev
npm run signaling
```

- App: http://localhost:3000  
- Signaling: http://localhost:4001  

Open the home page in two browsers (or a window plus a private window). Start a stream in one, join from the other.

## Production (Render + Neon)

Neon already holds Postgres. Render runs two web services from `render.yaml`:

| Service | What it is |
| --- | --- |
| `streamo-web` | Next.js UI + API |
| `streamo-signaling` | Socket.io / WebRTC signaling |

1. Push this repo to GitHub (Render deploys from Git).
2. In Render: **New → Blueprint** and select the repo.
3. Set **`DATABASE_URL`** on `streamo-web` to the Neon **pooled** connection string (`sslmode=require`).
4. Deploy. `INTERNAL_API_SECRET` is generated once and shared with signaling. Public URLs are wired automatically.

Free instances sleep after idle time, which will drop live streams. Use a paid instance for a public demo.

Browsers on different networks often need a **TURN** server. Set `NEXT_PUBLIC_TURN_URL`, `NEXT_PUBLIC_TURN_USERNAME`, and `NEXT_PUBLIC_TURN_CREDENTIAL` on `streamo-web`.

## How it works

1. Creating an event writes a `streams` row and returns an owner token stored only in that browser.
2. Going live captures camera tracks or `HTMLMediaElement.captureStream()` for a file.
3. Each viewer gets a WebRTC peer connection from the creator (mesh). Signaling is Socket.io.
4. **Listen only** tells the creator to `replaceTrack(null)` on the video sender for that viewer, which actually cuts video bitrate.
5. Viewer counts are room membership on the signaling server, mirrored to Postgres.

Scheduled events store a go-live time. The media file is **not** uploaded; the creator must keep (or re-select) it on the original device.

## Scripts

- `npm run dev` — Next.js
- `npm run signaling` — WebSocket signaling
- `npm test` — unit tests
- `npm run lint`
- `npm run build`

## Assumptions

- One creator per event; owner controls live in the creating browser.
- Mesh WebRTC is used instead of an SFU. Fine for small rooms; add an SFU if you need large audiences.
- TURN is optional in development and recommended in production.
