# STREAMO

A streaming platform with live WebRTC camera broadcasts and uploaded file events that work from iPhone Safari. Camera viewers can switch to **audio only** so the host stops sending video to that peer.

No viewer accounts or OBS required. File events use a private Supabase bucket on the Free plan; see [file event setup and limits](docs/file-events.md).

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

Free instances sleep after idle time, which can interrupt camera streams. Uploaded file playback does not depend on the signaling service staying awake.

Browsers on different networks often need a **TURN** server. Set `NEXT_PUBLIC_TURN_URL`, `NEXT_PUBLIC_TURN_USERNAME`, and `NEXT_PUBLIC_TURN_CREDENTIAL` on `streamo-web`.

## How it works

1. Creating an event writes a `streams` row and returns an owner token stored only in that browser.
2. Camera events capture camera tracks. File events upload up to 50 MB directly to private storage, then use a shared playback clock in Postgres.
3. Each camera viewer gets a WebRTC peer connection from the creator (mesh). Signaling is Socket.io. File viewers use expiring playback URLs.
4. For cameras, **Listen only** tells the creator to `replaceTrack(null)` on the video sender for that viewer, which actually cuts video bitrate.
5. Camera viewer counts are room membership on the signaling server, mirrored to Postgres. File events do not report viewer counts.

Scheduled events store a planned go-live time; the creator starts playback manually. After upload completes and playback starts, a file event continues if the creator closes the tab. Safari must stay open during upload.

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
