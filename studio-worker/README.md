# LevelUp Studio — capture worker

Multi-tenant adaptation of `content-brain-app`, pointed at LevelUp's Supabase.
Turns an Instagram reel / YouTube link into a transcript filed into the captor's
**own** `cb_reels` library. Deploys as its own Vercel project (root dir
`studio-worker/`); it is independent of the main React app's build.

## Flow

```
in-app paste / clipboard / iOS Shortcut
        │  POST /api/capture   (auth: Supabase JWT  or  per-user x-capture-token)
        ▼
  cb_reels row (status=pending, user_id set)          ← no media touches this request
        │
 Vercel Cron (every minute) → /api/cron → drainPending → pipeline:
   Apify (IG, logged-off) → /tmp mp4 → ffmpeg audio → Cloudflare Whisper → transcript
   YouTube → caption track (no transcription)
   …temp mp4/audio DELETED in-invocation (pipeline.mjs finally) — nothing durable stored
        ▼
  cb_reels row (status=done): pointer URL + oEmbed metadata + transcript ONLY
```

## What changed vs the single-user reference

- **Per-user, no shared secret.** `resolveUser()` accepts a logged-in Supabase
  access token (in-app) or a per-user `x-capture-token` (Shortcut), matched
  against `cb_capture_tokens`. The reference's one global `CAPTURE_SECRET` is gone.
- **Gated.** Capture requires `is_studio_enabled(user_id)` (active live-cohort).
- **Per-user dedup** on `(user_id, platform, shortcode)`.
- **Legal posture.** No `video_url` persisted, no thumbnail re-hosting to our
  storage (the reference's `durableThumb` is removed). We store pointer + oEmbed
  metadata + transcript only; transient mp4/audio are deleted in the same
  invocation. This is the App-Review + copyright defense.
- **Global ceiling, not per-user quota** (`STUDIO_DAILY_CAP`).

## Deploy

```bash
# from this folder, as its own Vercel project (root dir = studio-worker)
vercel --prod
# then set the env vars from .env.example in the Vercel project settings
```

Env: see [.env.example](.env.example). Secrets live in the iCloud vault
(`.env.supabase`, `.env.content_brain` = Apify, `.env.cloudflare` = Workers AI).

## Later

- Swap Apify → self-host `yt-dlp` + the existing `ffmpeg` for the IG path (cheaper
  at scale, cleanest legal posture). The pipeline is dependency-injected, so this
  is a `fetchReelMeta` swap, not a rewrite.
- The per-user MCP (`/api/mcp/<key>`) is a separate, later phase (P3).
