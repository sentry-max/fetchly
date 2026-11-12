import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = path.resolve(serverRoot, "..");

const environmentFile = path.join(projectRoot, ".env");
if (existsSync(environmentFile)) {
  process.loadEnvFile(environmentFile);
}

export interface AppConfig {
  port: number;
  host: string;
  staticDirectory: string | null;
  downloadDirectory: string;
  trustProxyHeaders: boolean;

  ytDlpPath: string;
  ytDlpProxy: string | null;
  ytDlpCookiesFile: string | null;
  ytDlpCookiesBase64: string | null;
  ytDlpExtraArguments: string[];
  ytDlpAutoUpdate: boolean;
  ffmpegLocation: string | null;

  maximumConcurrentDownloads: number;
  maximumQueuedDownloads: number;
  maximumActiveDownloadsPerClient: number;
  maximumVideoDurationSeconds: number;
  fileRetentionSeconds: number;
  inspectRequestsPerHour: number;
  downloadRequestsPerHour: number;
}

class ConfigurationError extends Error {
  override name = "ConfigurationError";
}

function readString(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function readInteger(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = readString(name);
  if (raw === null) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new ConfigurationError(`${name} must be an integer between ${minimum} and ${maximum}, received "${raw}".`);
  }
  return value;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = readString(name)?.toLowerCase();
  if (raw === undefined || raw === null) {
    return fallback;
  }
  if (["1", "true", "yes", "on"].includes(raw)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(raw)) {
    return false;
  }
  throw new ConfigurationError(`${name} must be true or false, received "${raw}".`);
}

function resolveStaticDirectory(): string | null {
  const configured = readString("STATIC_DIRECTORY");
  const candidate = configured ? path.resolve(configured) : path.join(projectRoot, "web", "dist");
  return existsSync(path.join(candidate, "index.html")) ? candidate : null;
}

export function loadConfig(): AppConfig {
  return {
    port: readInteger("PORT", 8080, 1, 65535),
    host: readString("HOST") ?? "0.0.0.0",
    staticDirectory: resolveStaticDirectory(),
    downloadDirectory: path.resolve(readString("DOWNLOAD_DIRECTORY") ?? path.join(os.tmpdir(), "fetchly")),
    trustProxyHeaders: readBoolean("TRUST_PROXY_HEADERS", true),

    ytDlpPath: readString("YTDLP_PATH") ?? "yt-dlp",
    ytDlpProxy: readString("YTDLP_PROXY"),
    ytDlpCookiesFile: readString("YTDLP_COOKIES_FILE"),
    ytDlpCookiesBase64: readString("YTDLP_COOKIES_BASE64"),
    ytDlpExtraArguments: readString("YTDLP_EXTRA_ARGUMENTS")?.split(/\s+/) ?? [],
    ytDlpAutoUpdate: readBoolean("YTDLP_AUTO_UPDATE", false),
    ffmpegLocation: readString("FFMPEG_LOCATION"),

    maximumConcurrentDownloads: readInteger("MAX_CONCURRENT_DOWNLOADS", 2, 1, 32),
    maximumQueuedDownloads: readInteger("MAX_QUEUED_DOWNLOADS", 20, 0, 1000),
    maximumActiveDownloadsPerClient: readInteger("MAX_ACTIVE_DOWNLOADS_PER_CLIENT", 2, 1, 50),
    maximumVideoDurationSeconds: readInteger("MAX_VIDEO_DURATION_MINUTES", 240, 1, 24 * 60) * 60,
    fileRetentionSeconds: readInteger("FILE_RETENTION_MINUTES", 30, 1, 24 * 60) * 60,
    inspectRequestsPerHour: readInteger("INSPECT_REQUESTS_PER_HOUR", 120, 1, 100_000),
    downloadRequestsPerHour: readInteger("DOWNLOAD_REQUESTS_PER_HOUR", 30, 1, 100_000),
  };
}
