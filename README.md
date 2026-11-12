# Fetchly

A self-hosted YouTube downloader with a clean web interface. Paste a link, pick a resolution or an audio format, and the server prepares the file with [yt-dlp](https://github.com/yt-dlp/yt-dlp) and ffmpeg.

- Video from 144p up to 4K as MP4 (H.264 is preferred wherever YouTube offers it), audio as M4A or MP3
- Live progress, queue position and cancellation
- English and Persian interface with a full right-to-left layout, light and dark themes
- Resumable file downloads through HTTP range requests
- Per-client rate limits, a global download queue and automatic cleanup of temporary files
- One Docker image for your own machine, a VPS, Cloudflare Tunnel or Cloudflare Containers

## Quick start

```bash
docker compose up --build
```

Open <http://localhost:8080>. The image contains Node.js, yt-dlp, ffmpeg and Deno, so nothing else needs to be installed.

## Local development

Requirements: Node.js 22.12 or newer, [yt-dlp](https://github.com/yt-dlp/yt-dlp#installation), ffmpeg, and preferably [Deno](https://deno.com) (yt-dlp falls back to Node.js for YouTube's JavaScript challenges when Deno is missing).

```bash
npm install
npm run dev
```

The API runs on port 8080 and the interface on <http://localhost:5173> with hot reload; requests to `/api` are proxied automatically.

| Command             | Purpose                                         |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | API and interface in watch mode                 |
| `npm start`         | Production build served on a single port (8080) |
| `npm test`          | Server unit tests                               |
| `npm run typecheck` | Type checking for all packages                  |

## Configuration

All settings are environment variables. Copy `.env.example` to `.env` to change them; every value is optional.

| Variable                          | Default            | Description                                                        |
| --------------------------------- | ------------------ | ------------------------------------------------------------------ |
| `PORT`                            | `8080`             | HTTP port                                                          |
| `MAX_CONCURRENT_DOWNLOADS`        | `2`                | Downloads processed at the same time                               |
| `MAX_QUEUED_DOWNLOADS`            | `20`               | Waiting downloads before new requests are refused                  |
| `MAX_ACTIVE_DOWNLOADS_PER_CLIENT` | `2`                | Unfinished downloads allowed per visitor                           |
| `MAX_VIDEO_DURATION_MINUTES`      | `240`              | Longest video accepted                                             |
| `FILE_RETENTION_MINUTES`          | `30`               | How long a finished file stays available                           |
| `INSPECT_REQUESTS_PER_HOUR`       | `120`              | Link lookups per visitor per hour                                  |
| `DOWNLOAD_REQUESTS_PER_HOUR`      | `30`               | Downloads started per visitor per hour                             |
| `TRUST_PROXY_HEADERS`             | `true`             | Read the visitor address from `CF-Connecting-IP`/`X-Forwarded-For` |
| `DOWNLOAD_DIRECTORY`              | system temp folder | Working directory for temporary files                              |
| `YTDLP_PATH`                      | `yt-dlp`           | Path to the yt-dlp executable                                      |
| `YTDLP_AUTO_UPDATE`               | `false`            | Update yt-dlp on start and once a day while idle                   |
| `YTDLP_COOKIES_FILE`              |                    | Netscape cookies file passed to yt-dlp                             |
| `YTDLP_COOKIES_BASE64`            |                    | The same cookies file, base64 encoded (handy for secrets)          |
| `YTDLP_PROXY`                     |                    | Proxy for YouTube traffic, for example `socks5://host:1080`        |
| `YTDLP_EXTRA_ARGUMENTS`           |                    | Additional yt-dlp flags, separated by spaces                       |
| `FFMPEG_LOCATION`                 |                    | Directory or path of ffmpeg if it is not on `PATH`                 |

Set `TRUST_PROXY_HEADERS=false` when the server is reachable directly, without Cloudflare in front of it; otherwise visitors could spoof their address and bypass rate limits.

## Deploying on Cloudflare

Cloudflare Workers and Pages cannot run yt-dlp or ffmpeg, so the downloader runs as a container. Both options below use the same Dockerfile.

### Option A: Cloudflare Containers

Everything runs on Cloudflare. Requires the Workers Paid plan and Docker running locally, because Wrangler builds the image and pushes it to Cloudflare's registry.

```bash
cd cloudflare
npm install
npx wrangler login
npm run deploy
```

The interface is served by Workers Static Assets, so pages load instantly. Only `/api/*` reaches the container, which is started on demand and stopped after 15 minutes without requests. Attach your domain under **Workers & Pages → fetchly → Settings → Domains & Routes**.

Settings live in `cloudflare/wrangler.jsonc` under `vars`. Secrets are stored with Wrangler and forwarded to the container:

```bash
base64 -w0 cookies.txt | npx wrangler secret put YTDLP_COOKIES_BASE64
```

### Option B: Cloudflare Tunnel

The app runs on your own computer or server and is published on your domain through a tunnel, with no open ports.

1. In the Cloudflare dashboard open **Zero Trust → Networks → Tunnels**, create a tunnel and copy its token.
2. Add a public hostname for your domain that points to `http://app:8080`.
3. Put the token in `.env` as `CLOUDFLARE_TUNNEL_TOKEN`.
4. Start both services:

```bash
docker compose --profile tunnel up -d --build
```

Cloudflare's service terms for the Free, Pro and Business plans restrict serving video and other large files through the CDN unless they come from a Cloudflare product such as the Developer Platform. Heavy use over a tunnel can therefore be throttled; Option A does not have this limitation.

## When YouTube blocks the server

YouTube often answers requests from data centre addresses, Cloudflare included, with "Sign in to confirm you're not a bot". The interface then shows a "temporarily limiting requests" message. In order of effort:

1. Keep yt-dlp current. Enable `YTDLP_AUTO_UPDATE=true` or rebuild the image; most extraction failures are fixed upstream within days.
2. Provide cookies. Export them in Netscape format from a browser that is signed in to a secondary Google account and set `YTDLP_COOKIES_FILE` or `YTDLP_COOKIES_BASE64`. YouTube may restrict accounts that are used this way, so do not use your main account.
3. Route YouTube traffic through a residential proxy with `YTDLP_PROXY`, or run Option B on a home connection.

## How it works

```
Browser ──POST /api/videos/inspect──▶ yt-dlp --dump-single-json  ─▶ quality options (cached 20 min)
        ──POST /api/jobs────────────▶ queue ─▶ yt-dlp + ffmpeg   ─▶ temporary file
        ──GET  /api/jobs/:id────────▶ status and progress (polled every second)
        ──GET  /api/jobs/:id/file───▶ file stream with Content-Disposition and range support
```

Only the 11-character video id extracted from the link is ever passed to yt-dlp, and processes are started without a shell. Downloads that nobody is polling for two minutes are cancelled, and finished files are deleted after the retention period.

| Endpoint                   | Description                                       |
| -------------------------- | ------------------------------------------------- |
| `POST /api/videos/inspect` | `{ "url": "…" }` → video details and formats      |
| `POST /api/jobs`           | `{ "videoId": "…", "optionId": "video-1080" }`    |
| `GET /api/jobs/:id`        | Job status, progress and file details             |
| `DELETE /api/jobs/:id`     | Cancel a job or delete its file                   |
| `GET /api/jobs/:id/file`   | Download the finished file                        |
| `GET /api/health`          | yt-dlp version, ffmpeg availability, queue length |

## Project structure

```
server/       Node.js API (Hono): link parsing, format selection, download queue
web/          React interface (Vite): English and Persian, light and dark themes
cloudflare/   Worker and Wrangler configuration for Cloudflare Containers
Dockerfile    Production image with Node.js, yt-dlp, ffmpeg and Deno
```

The product name is set in `web/src/config.ts`; translations are in `web/src/i18n`.

## Legal

Downloading videos can be against YouTube's Terms of Service and may infringe copyright. Use this software only for content you own, content published under a licence that allows it, or content you have permission to save. You are responsible for how your deployment is used.
