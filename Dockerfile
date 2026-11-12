# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22
ARG DENO_VERSION=2.9.3

FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --no-audit --no-fund
COPY server server
COPY web web
RUN npm run build

FROM node:${NODE_VERSION}-bookworm-slim AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --workspace server --no-audit --no-fund

# Deno is the JavaScript runtime yt-dlp prefers for solving YouTube player challenges.
FROM denoland/deno:bin-${DENO_VERSION} AS deno

FROM node:${NODE_VERSION}-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates ffmpeg python3 tini \
  && rm -rf /var/lib/apt/lists/* \
  && install --directory --owner=node --group=node /opt/yt-dlp

COPY --from=deno /deno /usr/local/bin/deno

# The official zipimport build bundles the EJS challenge solver and can update itself in place.
ARG YT_DLP_URL=https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp
ADD --chown=node:node --chmod=755 ${YT_DLP_URL} /opt/yt-dlp/yt-dlp

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    YTDLP_PATH=/opt/yt-dlp/yt-dlp \
    DOWNLOAD_DIRECTORY=/tmp/fetchly

WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node server/package.json ./server/
COPY --from=build --chown=node:node /app/server/dist ./server/dist
COPY --from=build --chown=node:node /app/web/dist ./web/dist

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server/dist/index.js"]
