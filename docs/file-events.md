# Uploaded file events

File events upload directly from Safari or another browser into the private
`streamo-media` Supabase bucket. The server checks the existing event owner key
before issuing a single-object upload URL. No Supabase server key goes to a client.
Camera events continue to use WebRTC.

## Deployment

1. Keep the Supabase organization on Free. Create a **private** `streamo-media`
   bucket, with a 50 MB limit and these MIME types:
   `video/mp4,video/quicktime,audio/mp4,audio/mpeg`.
2. Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` only on the Next.js server.
   No public bucket or anonymous-write policies are needed.
3. Run `npm run db:migrate` against the existing STREAMO database before deploying
   the new frontend. Vercel runs this before its build through `vercel.json`.
   The migration adds `file_broadcasts`; it does not move the
   existing database to Supabase or alter existing stream records.
   Use a separate database for previews. A migration failure stops the deployment;
   do not reset a populated database or automatically mark migrations as applied.
4. Deploy both updated app dependencies and code. The signaling service needs no
   changes for uploaded events.

## Limits and behavior

- Each file must be at most 50,000,000 bytes and six hours long. At most 18 upload
  reservations exist across the app (900 MB worst case). Unfinished uploads count
  too, so restarting the app cannot bypass the limit. The bucket must be dedicated
  to this app; manually uploaded objects aren't included in its reservation count.
- Files are not transcoded. Native browser playback is used. H.264/AAC MP4 is the
  recommended video format; MOV files may contain codecs other viewers cannot play.
- The creator must keep Safari open until upload completes. Cancelled uploads can
  be retried with the same file. Existing objects are never overwritten.
- Start, pause, resume, and stop update an authoritative clock in Postgres. Viewers
  poll every four seconds and catch up when returning from the background. Closing
  the creator's tab does not end a started event. Viewers may need to tap for sound.
- Playback uses expiring signed URLs (one hour, renewed during viewing), not public
  storage. This is not DRM: a viewer can save content already made available to them,
  and an issued URL remains valid until expiry even after an event stops.
- Removal is an explicit owner action, only after the last upload ticket expires
  (two hours plus a safety margin). This prevents deleted objects from being
  restored through an outstanding upload ticket. There is no automatic deletion.
- Free storage and egress quotas still apply; the reservation cap controls storage,
  not Supabase's monthly bandwidth. Do not upgrade the plan or enable paid add-ons.
- Uploaded events do not report a viewer count or offer adaptive resolution/audio-only
  delivery. Their studio preview is local; use Open live player for the event clock.

## Device verification

On a real iPhone, choose a small compatible MP4, wait for metadata, upload, and
start. Open the viewer on a second device; check sound activation, a late join,
pause/resume, background/foreground recovery, and stop. Test retry after an
interrupted upload. A desktop browser test does not prove iOS codec compatibility.
