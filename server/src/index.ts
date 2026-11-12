import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { serve } from "@hono/node-server";
import { createApp, createRateLimiters } from "./app.js";
import { loadConfig, type AppConfig } from "./config.js";
import { DownloadManager } from "./downloads/downloadManager.js";
import { logger } from "./logger.js";
import { isFfmpegAvailable, YtDlp } from "./process/ytDlp.js";
import type { RuntimeStatus } from "./routes/healthRoutes.js";
import { VideoInspector } from "./youtube/videoInspector.js";

const sweepIntervalMilliseconds = 30_000;
const updateIntervalMilliseconds = 24 * 60 * 60 * 1000;
const jobDirectoryPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface WorkingPaths {
  cacheDirectory: string;
  inspectionDirectory: string;
}

/** Removes leftovers from a previous run. Only entries created by this server are touched. */
async function prepareDownloadDirectory(downloadDirectory: string): Promise<WorkingPaths> {
  const cacheDirectory = path.join(downloadDirectory, "cache");
  const inspectionDirectory = path.join(downloadDirectory, "inspections");

  await mkdir(downloadDirectory, { recursive: true });
  for (const entry of await readdir(downloadDirectory)) {
    if (jobDirectoryPattern.test(entry) || entry === "inspections") {
      await rm(path.join(downloadDirectory, entry), { recursive: true, force: true });
    }
  }
  await mkdir(cacheDirectory, { recursive: true });
  await mkdir(inspectionDirectory, { recursive: true });

  return { cacheDirectory, inspectionDirectory };
}

async function resolveCookiesFile(config: AppConfig): Promise<string | null> {
  if (config.ytDlpCookiesFile) {
    return path.resolve(config.ytDlpCookiesFile);
  }
  if (!config.ytDlpCookiesBase64) {
    return null;
  }

  const cookiesFile = path.join(config.downloadDirectory, "cookies.txt");
  await writeFile(cookiesFile, Buffer.from(config.ytDlpCookiesBase64, "base64"), { mode: 0o600 });
  return cookiesFile;
}

function scheduleUpdates(ytDlp: YtDlp, downloads: DownloadManager, runtimeStatus: RuntimeStatus): void {
  const runUpdate = async (): Promise<void> => {
    if (downloads.stats.running > 0) {
      setTimeout(() => void runUpdate(), 10 * 60 * 1000).unref();
      return;
    }
    try {
      const output = await ytDlp.update();
      runtimeStatus.ytDlpVersion = await ytDlp.version();
      logger.info("yt-dlp update check finished", { version: runtimeStatus.ytDlpVersion, output });
    } catch (error) {
      logger.warn("yt-dlp update failed", { error });
    }
  };

  void runUpdate();
  setInterval(() => void runUpdate(), updateIntervalMilliseconds).unref();
}

async function main(): Promise<void> {
  const config = loadConfig();
  const { cacheDirectory, inspectionDirectory } = await prepareDownloadDirectory(config.downloadDirectory);

  const ytDlp = new YtDlp({
    executablePath: config.ytDlpPath,
    cacheDirectory,
    cookiesFile: await resolveCookiesFile(config),
    proxy: config.ytDlpProxy,
    ffmpegLocation: config.ffmpegLocation,
    extraArguments: config.ytDlpExtraArguments,
  });

  const runtimeStatus: RuntimeStatus = {
    ytDlpVersion: await ytDlp.version(),
    ffmpegAvailable: await isFfmpegAvailable(config.ffmpegLocation),
  };

  if (!runtimeStatus.ytDlpVersion) {
    logger.error("yt-dlp is not available. Install it or set YTDLP_PATH.", { path: config.ytDlpPath });
  }
  if (!runtimeStatus.ffmpegAvailable) {
    logger.error("ffmpeg is not available. Install it or set FFMPEG_LOCATION.");
  }

  const inspector = new VideoInspector({
    ytDlp,
    inspectionDirectory,
    maximumVideoDurationSeconds: config.maximumVideoDurationSeconds,
  });

  const downloads = new DownloadManager({
    ytDlp,
    inspector,
    downloadDirectory: config.downloadDirectory,
    maximumConcurrentDownloads: config.maximumConcurrentDownloads,
    maximumQueuedDownloads: config.maximumQueuedDownloads,
    maximumActiveDownloadsPerClient: config.maximumActiveDownloadsPerClient,
    fileRetentionSeconds: config.fileRetentionSeconds,
  });

  const rateLimiters = createRateLimiters(config);
  const app = createApp({ config, inspector, downloads, runtimeStatus, ...rateLimiters });

  const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (address) => {
    logger.info("Server started", {
      url: `http://${address.address === "0.0.0.0" ? "localhost" : address.address}:${address.port}`,
      ytDlp: runtimeStatus.ytDlpVersion,
      staticFiles: config.staticDirectory ?? "disabled",
    });
  });

  const sweepTimer = setInterval(() => {
    inspector.purgeExpired();
    rateLimiters.inspectLimiter.prune();
    rateLimiters.downloadLimiter.prune();
    downloads.sweep().catch((error: unknown) => logger.warn("Cleanup failed", { error }));
  }, sweepIntervalMilliseconds);
  sweepTimer.unref();

  if (config.ytDlpAutoUpdate && runtimeStatus.ytDlpVersion) {
    scheduleUpdates(ytDlp, downloads, runtimeStatus);
  }

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("Shutting down", { signal });

    const forceExit = setTimeout(() => process.exit(1), 10_000);
    forceExit.unref();

    server.close();
    downloads
      .shutdown()
      .catch((error: unknown) => logger.warn("Shutdown cleanup failed", { error }))
      .finally(() => process.exit(0));
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error: unknown) => {
  logger.error("Server failed to start", { error });
  process.exit(1);
});
