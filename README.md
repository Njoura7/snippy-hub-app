# Cutroom

Takes a long-form video (YouTube/Twitch URL or upload, up to ~4-6GB / 1-2hr), transcribes it, uses an LLM to find and score "viral" moments, cuts vertical clips, and burns in styled captions.

This is a monorepo: a Lovable-built frontend and a Fastify backend, developed and deployed independently of each other.

```
cutroom/
├── frontend/     — React/TanStack Start UI (Lovable-managed)
└── backend/      — Fastify API + worker (this is what's being scaffolded)
    ├── apps/
    │   ├── api/      — HTTP service: create projects, poll status, list/edit clips
    │   └── worker/   — polls the jobs table, runs the pipeline (ffmpeg/yt-dlp live only here)
    └── packages/
        ├── db/        — Drizzle schema + migrations (shared by api & worker)
        ├── storage/   — local-disk / R2 driver, swappable via STORAGE_DRIVER
        ├── pipeline/  — the 4 pipeline steps as pure, testable functions
        └── shared/    — cross-package TS types
```

## Status

**All 4 pipeline steps are implemented and verified end-to-end**, including in a real browser against real rendered output:

1. **Ingest** — yt-dlp (with `player_client=android`, see below) or upload, pushed to storage.
2. **Transcribe** — audio chunked for Groq's size limit, transcribed via Whisper large-v3-turbo, word timestamps merged and stored.
3. **Analyze** — transcript chunked by time window, scored via forced tool-use, parsed into clip candidates. Provider is swappable (`ANALYZE_PROVIDER`, same pattern as `STORAGE_DRIVER`) — see below.
4. **Cut + caption** — ffmpeg cuts the clip, crops to 9:16 with scene-aware face tracking (see below), burns in an ASS subtitle track (word-by-word captions + a persistent header caption) generated from real word timestamps, optionally mixes in background music, uploads the render. Triggered per-clip via `POST /clips/:id/export`, not auto-chained (clips need review first).

Ingest → transcribe → analyze auto-chain (each job creates the next on success). `cut_caption` is user-triggered and only affects that one (clip, platform) render on failure — it never fails the whole project.

**Smart crop:** a fixed center-crop misses the speaker whenever the source camera cuts to a different framing (wide two-shot, cutaway, etc.) — a real, common problem for podcast-style sources. `packages/pipeline/src/steps/smartCrop.ts` instead detects camera cuts within each clip (`clients/sceneDetect.ts`, ffmpeg's own scene-change scoring, no new dependency) and re-centers the crop on the largest detected face after each cut (`clients/opencv.ts`, OpenCV.js's YuNet face detector — WASM, no native compile, ~230KB ONNX model in `packages/pipeline/assets/`). Verified visually against a real wide two-shot: without this, the crop showed an empty background at the cut; with it, it re-centers on whichever speaker is in frame. Adds a few seconds per clip.

Two things worth knowing if you're extending this: (1) YuNet's default 0.9 confidence threshold is too strict for smaller/angled faces in wide shots — we run it at 0.6; (2) never downscale the detection frame *below* the source's native resolution — a 640x360 source already has small faces, and shrinking further pushed real detections under the confidence threshold. Both were found by testing against this exact podcast, not assumed.

**Render quality:** `-preset slow -crf 18` (was `veryfast`/`20`) and lanczos scaling — tuned for local rendering where wall-clock time is cheap and output quality is what's being optimized for.

**Header caption:** a persistent hook overlay at the top of the clip (ASS text, `clients/ass.ts`), plus an emoji **badge image** top-left (`clients/ffmpegRender.ts`, composited with ffmpeg's `overlay` filter — not ASS text). Toggle on/off and edit hook/emoji per clip via `PATCH /clips/:id` — the frontend clip editor has a dedicated "Header caption" card.

**Why the emoji is a real image, not a text glyph:** tested both options directly — `font-noto-emoji`'s color glyphs don't render at all on this Alpine ffmpeg/libass build (blank box), and the monochrome fallback (`font-unifont`) technically works but is visibly pixelated (it's a bitmap font). Neither is acceptable for something people will actually post. Instead, `clients/emojiLibrary.ts` composites real PNGs — [Twemoji](https://github.com/jdecked/twemoji) (CC-BY 4.0) via `cdn.jsdelivr.net`, one-time download into `packages/pipeline/assets/emoji/` — at a fixed size/position, crisp regardless of render resolution. The tradeoff: this only works for a **closed set of ~20 emoji** (`emojiLibrary.ts`'s manifest), not arbitrary Unicode — the analyze prompt's schema and the frontend picker (`GET /emoji`) are both constrained to exactly that set, so every choice always has a matching asset. Add more by dropping a PNG in that folder and adding a manifest entry.

**Stale-render warning:** exporting is a snapshot, not live — editing settings and clicking "Save draft" (without re-exporting) does *not* update the already-rendered video. The clip editor now compares the clip's `updatedAt` against the active render's `updatedAt` and shows a clear banner ("you've changed settings since this was exported") instead of silently showing outdated output. This was the actual cause of a real bug report ("the background music wasn't in my export") — the render had simply been kicked off before music was selected.

**Background music:** optional, mixed quietly under the dialogue via a `-filter_complex` amix chain (`clients/ffmpegRender.ts` — loop, trim to clip length, fade in/out, mix at ~-18dB relative to speech, no loudness normalization so treat that as a rough default, not a precise target). **The bundled track is a placeholder** — 16 seconds of ffmpeg-synthesized sine tones (`packages/pipeline/assets/music/placeholder-ambient.mp3`), not a real recording. I can't legally bundle actual trending TikTok/Instagram sounds (those are commercial, label-licensed tracks — redistributing them here would be copyright infringement even though TikTok/IG's own apps can play them under their own licensing deals). To add real tracks: drop a licensed mp3 (Epidemic Sound, Artlist, YouTube Audio Library, or anything you have rights to) into `packages/pipeline/assets/music/` and add an entry to `manifest.json` — the picker and mixing pick it up automatically, no code changes.

**HD downloads (yt-dlp):** YouTube's default client increasingly 403s the actual media request without a PO token (SABR streaming), so without one, ingest falls back to the `android` client's progressive stream — reliable, but capped around 240-360p depending on the video (verified: this isn't per-video variance, it's that client's only non-blocked format right now). A cookies.txt from a real, logged-in YouTube session satisfies the PO-token check and unlocks the full adaptive ladder up to 1080p — see `backend/.env.example` (`YTDLP_COOKIES_FILE`) for how to set it up. **I couldn't test this path myself** (no browser session available in this environment) — the fallback-on-failure logic means a bad/missing cookies file degrades to the reliable 360p path rather than breaking ingest, but the HD path itself is unverified beyond typechecking and code review.

**Freeing disk space:** `backend/scripts/cleanup-source.sh <projectId>` (or `DELETE /projects/:id/source`) deletes just the source video — by far the largest file per project — once you're done exporting clips from it. The project row, transcript, and already-rendered clips stay intact; only exporting a *new* clip from that project stops working afterward.

**Analyze provider — free by default:** `ANALYZE_PROVIDER=groq` (the default) scores clips with `openai/gpt-oss-120b` on Groq's free tier, reusing `GROQ_API_KEY` — no separate signup, no Anthropic credits needed to see the full pipeline run. Set `ANALYZE_PROVIDER=anthropic` for Claude Haiku instead (paid — needs real credits at console.anthropic.com → Plans & Billing; generally sharper scoring/hooks). Both hit the exact same prompt and JSON schema (`packages/pipeline/src/clients/scoringPrompt.ts`), so swapping providers doesn't change anything else about the pipeline.

**Groq free-tier rate limits:** `openai/gpt-oss-120b`'s free tier caps out around 8000 tokens/minute — a long episode's chunk loop can hit that within 1-2 requests. The analyze step paces requests and retries rate-limited chunks with backoff (`packages/pipeline/src/steps/analyze.ts`) rather than failing the whole job; a chunk that's still rate-limited after retries is skipped (that time range just won't have clip candidates) instead of losing every chunk already scored. Expect a long podcast's analyze step to take a few minutes for this reason. If Groq's available models change, `curl https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"` shows what's actually enabled for your account.

## Why Drizzle over Prisma

No codegen engine binary (Prisma bundles a Rust binary per platform, which complicates a slim Docker image that already needs to fit ffmpeg/yt-dlp), schema is plain TypeScript so `packages/db` is just imported by both apps with no generate step, and migrations are plain `.sql` files that are easy to read in review and run as an explicit container startup step.

## Schema

5 tables — `projects`, `jobs`, `clips` as planned, plus two additions:

- **`transcripts`** — split out from `projects` (rather than a jsonb column on it) so listing/polling projects stays cheap and never drags a large word-timestamp blob along.
- **`clip_renders`** — one row per `(clip, platform)`. A clip renders one output per selected platform ("a single video generates a variant per platform" — confirmed against the existing frontend's `platform-store.ts`), so status/storage-key/error need to be tracked per platform, not as one column on `clips`.

Full schema: [backend/packages/db/src/schema.ts](backend/packages/db/src/schema.ts). Generated migration: [backend/packages/db/drizzle/0000_chunky_starjammers.sql](backend/packages/db/drizzle/0000_chunky_starjammers.sql).

The `jobs` queue claims work with `SELECT ... FOR UPDATE SKIP LOCKED` (see [backend/packages/db/src/jobs.ts](backend/packages/db/src/jobs.ts)) even though only one worker runs today — raising concurrency later needs no schema or query change. Failed jobs retry with exponential backoff (30s, 60s, 120s, ...) up to `max_attempts`, then the parent project flips to `status: "failed"`.

## Storage: local disk vs R2 (get your first run for $0)

`STORAGE_DRIVER` in `backend/.env` picks the driver — same interface either way ([backend/packages/storage/src/types.ts](backend/packages/storage/src/types.ts)):

- **`local`** (default) — writes to a Docker volume, served back out by the API's `GET /files/:key`. Zero setup, $0, works fully offline. Use this for your first video → clips run.
- **`r2`** — Cloudflare R2, S3-compatible. Free tier is **10GB-month storage, 1M Class A ops/mo, 10M Class B ops/mo** — a handful of test videos and their clips will comfortably stay inside that, so flipping to `r2` for testing is also $0 as long as you stay under those limits. Switch to this once you want files to survive a container restart, or to test the real production path.

Nothing else in the code changes when you switch — same routes, same job handlers, same pipeline step signatures.

## What's actually free to test right now

With the defaults (`STORAGE_DRIVER=local`, `ANALYZE_PROVIDER=groq`), **the entire pipeline — ingest through analyze — runs on $0**, just one `GROQ_API_KEY`. Cost breakdown:

| Piece | Cost |
|---|---|
| Local Postgres, ffmpeg, yt-dlp | Free (local compute) |
| R2, within free tier | Free (see limits above) — not even needed with `STORAGE_DRIVER=local` |
| Groq Whisper large-v3-turbo (transcribe) | Free tier — check current limits at [console.groq.com](https://console.groq.com), they change |
| Groq `openai/gpt-oss-120b` (analyze, default) | Free tier — rate-limited (see above), not zero-latency, but $0 |
| Anthropic Claude Haiku 4.5 (analyze, `ANALYZE_PROVIDER=anthropic`) | **Not free** — $1 / $5 per 1M input/output tokens. Optional upgrade for sharper scoring once you're past free-tier testing. |

## Railway constraints to keep in mind

- **Ephemeral disk on every tier** — treat local disk as scratch space only (download → process → upload to storage → delete local temp). A job that dies mid-`ffmpeg` must be resumable from storage + DB state, never from a local temp file. The pipeline already follows this (see `ingestFromUrl` in [backend/packages/pipeline/src/steps/ingest.ts](backend/packages/pipeline/src/steps/ingest.ts) — temp dir is always cleaned up in a `finally`).
- **Memory** — a 1-2hr source video plus ffmpeg re-encoding can spike well past hobby-tier RAM. The worker service will likely need a higher tier than the API service; they scale independently since they deploy as separate Railway services from the same repo.
- **Build time** — ffmpeg/yt-dlp install via `apk` in the worker image; the Dockerfiles copy `package.json` files before source specifically so `npm install` stays cached across source-only rebuilds.
- **Two services, one repo** — `backend/apps/api/Dockerfile` and `backend/apps/worker/Dockerfile` deploy as two separate Railway services pointed at the same repo with different Dockerfile paths.

---

## Setup

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Node.js 22+ (only needed if you want to run `api`/`worker` natively instead of in Docker, or run typecheck/lint on the host)

### 1. Environment

```bash
cp backend/.env.example backend/.env
```

Defaults are already filled in for local dev (`STORAGE_DRIVER=local`, `DATABASE_URL` pointing at the Postgres container below). Nothing else to fill in for Step 1.

### 2. Start Postgres + the dashboard

```bash
docker compose up -d postgres adminer
```

- **Adminer** (Postgres dashboard): [http://localhost:8081](http://localhost:8081) — System: `PostgreSQL`, Server: `postgres`, Username: `cutroom`, Password: `cutroom`, Database: `cutroom`. (Deliberately not 8080 — see step 7, the frontend needs that one.)

### 3. Run migrations

```bash
cd backend/packages/db
npm install    # first time only, or from backend/ run: npm install (installs all workspaces)
npm run migrate
```

This applies [0000_chunky_starjammers.sql](backend/packages/db/drizzle/0000_chunky_starjammers.sql) — you should see the 5 tables appear in Adminer afterward.

### 4. Start the API and worker

Two ways to run these — pick one:

**Fully in Docker** (matches production, includes ffmpeg/yt-dlp automatically):

```bash
docker compose up -d --build api worker
```

**Natively on your host** (faster iteration, hot reload via `tsx watch`):

```bash
cd backend
npm install
npm run dev:api     # in one terminal
npm run dev:worker  # in another
```

> Native worker mode needs `ffmpeg`, `ffprobe`, and `yt-dlp` installed on your host machine — they're only pre-installed inside the Docker image. If you don't have them locally, run the worker via Docker instead.

The API listens on **[http://localhost:3000](http://localhost:3000)**.

### 5. Create a project and watch it ingest

**From a YouTube/Twitch URL:**

```bash
curl -X POST http://localhost:3000/projects \
  -H "Content-Type: application/json" \
  -d '{"sourceUrl": "https://www.youtube.com/watch?v=...", "sourceType": "youtube", "targetPlatforms": ["tiktok"]}'
```

**From a local file upload** (send `targetPlatforms` *before* `file` in the form — see the code comment in `routes/projects.ts` for why):

```bash
curl -X POST http://localhost:3000/projects/upload \
  -F "targetPlatforms=[\"tiktok\"]" \
  -F "file=@/path/to/video.mp4"
```

Either call returns `{ "project": { "id": "...", "status": "ingesting", ... } }`. Poll it:

```bash
curl http://localhost:3000/projects/<id>
curl http://localhost:3000/projects/<id>/jobs
```

`status` should flip `ingesting` → `ingested` once the worker's log shows `completed job ...`. With `STORAGE_DRIVER=local`, the downloaded file is servable at `http://localhost:3000/files/<storageKey>` (the `storageKey` field on the project).

### 6. Quick smoke test (instead of steps 5 by hand)

```bash
backend/scripts/smoke-test-ingest.sh                            # downloads a ~19s public test video
backend/scripts/smoke-test-ingest.sh <youtube-or-twitch-url>     # your own URL
backend/scripts/smoke-test-ingest.sh --file /path/to/video.mp4   # upload flow instead
```

Creates a project, polls until it's `ingested` (or `failed`), prints the result. $0 either way — no API keys involved.

### 7. Frontend

```bash
cp frontend/.env.example frontend/.env   # VITE_API_BASE_URL=http://localhost:3000
cd frontend && npm install && npm run dev
```

(Or `docker compose up -d --build frontend` for the containerized version — same port, 8080.)

Always **[http://localhost:8080](http://localhost:8080)**, native or Docker — Lovable's `vite-tanstack-config` hard-forces the dev server onto 8080 (it ignores a different port in `vite.config.ts` and just warns). That's *why* Adminer above sits on 8081 instead of its usual 8080 — freeing 8080 for the frontend means the port is always the same, instead of Vite silently cascading to 8081/8082/... whenever something else already holds 8080.

**What's real vs. mock right now:**

- **Home page** — "Generate clips" actually calls `POST /projects`/`POST /projects/upload` and navigates to the real processing screen. "Recent projects" shows real projects once any exist; falls back to the example list when there aren't any yet.
- **Processing screen** — polls the real project status while it downloads. Since transcribe/analyze/cut don't exist yet, it hands off straight to the clips screen once ingest finishes rather than faking progress through steps that aren't real.
- **Clips screen** — fetches real clips for the project (`GET /projects/:id/clips`, currently always `[]`) and falls back to the example clip set with a visible "Showing example clips" banner when there are none. The project title in the header is real.
- **Clip editor** — still fully on mock data (waveform, transcript, trim). There's no real equivalent for any of that yet — building it would mean fabricating data Step 2-4 haven't produced.

## API surface so far

| Method | Path | Notes |
|---|---|---|
| `POST` | `/projects` | JSON body, URL-based ingest (`sourceUrl`, `sourceType`, `targetPlatforms`) |
| `POST` | `/projects/upload` | multipart, file-based ingest |
| `GET` | `/projects` | list, newest first |
| `GET` | `/projects/:id` | single project + status |
| `GET` | `/projects/:id/jobs` | job history/progress for a project |
| `GET` | `/files/:key` | only when `STORAGE_DRIVER=local` — serves stored files with Range support |
| `GET` | `/health` | liveness check |

Clip endpoints (list/approve/edit/export) come with Step 3-4 once clips actually exist.
