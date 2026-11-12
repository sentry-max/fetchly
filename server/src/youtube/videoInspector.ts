import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ApiError } from "../http/apiError.js";
import { logger } from "../logger.js";
import type { YtDlp } from "../process/ytDlp.js";
import { Semaphore } from "../support/semaphore.js";
import { buildQualityOptions, type QualityOption } from "./qualityOptions.js";
import type { YtDlpVideoInfo } from "./videoInfo.js";
import { buildWatchUrl } from "./youtubeUrl.js";

export interface VideoSummary {
  id: string;
  title: string;
  channel: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string;
  sourceUrl: string;
}

export interface Inspection {
  summary: VideoSummary;
  options: QualityOption[];
  infoFilePath: string;
  expiresAt: number;
}

interface VideoInspectorOptions {
  ytDlp: YtDlp;
  inspectionDirectory: string;
  maximumVideoDurationSeconds: number;
}

// Stream URLs inside the cached JSON stay valid for several hours; twenty minutes keeps a wide margin.
const cacheLifetimeMilliseconds = 20 * 60 * 1000;
const maximumCachedInspections = 200;
const inspectionTimeoutMilliseconds = 60_000;

export class VideoInspector {
  private readonly cache = new Map<string, Inspection>();
  private readonly pending = new Map<string, Promise<Inspection>>();
  private readonly concurrency = new Semaphore(4);
  private readonly options: VideoInspectorOptions;

  constructor(options: VideoInspectorOptions) {
    this.options = options;
  }

  getCached(videoId: string): Inspection | null {
    const cached = this.cache.get(videoId);
    if (!cached || cached.expiresAt <= Date.now()) {
      return null;
    }
    return cached;
  }

  async inspect(videoId: string): Promise<Inspection> {
    const cached = this.getCached(videoId);
    if (cached) {
      return cached;
    }

    const inFlight = this.pending.get(videoId);
    if (inFlight) {
      return inFlight;
    }

    const request = this.concurrency
      .use(() => this.fetchInspection(videoId))
      .finally(() => this.pending.delete(videoId));
    this.pending.set(videoId, request);
    return request;
  }

  invalidate(videoId: string): void {
    const cached = this.cache.get(videoId);
    if (cached) {
      this.cache.delete(videoId);
      void rm(cached.infoFilePath, { force: true });
    }
  }

  purgeExpired(): void {
    const now = Date.now();
    for (const [videoId, inspection] of this.cache) {
      if (inspection.expiresAt <= now) {
        this.invalidate(videoId);
      }
    }
  }

  private async fetchInspection(videoId: string): Promise<Inspection> {
    const startedAt = Date.now();
    const output = await this.options.ytDlp.run(
      ["--dump-single-json", "--skip-download", "--no-progress", buildWatchUrl(videoId)],
      { timeoutMilliseconds: inspectionTimeoutMilliseconds, failureCode: "INSPECTION_FAILED" },
    );

    let info: YtDlpVideoInfo;
    try {
      info = JSON.parse(output) as YtDlpVideoInfo;
    } catch {
      throw new ApiError("INSPECTION_FAILED", "yt-dlp returned malformed metadata.");
    }

    if (info.is_live || info.live_status === "is_live" || info.live_status === "is_upcoming") {
      throw new ApiError("LIVE_NOT_SUPPORTED");
    }

    const durationSeconds = info.duration ? Math.round(info.duration) : null;
    if (durationSeconds && durationSeconds > this.options.maximumVideoDurationSeconds) {
      throw new ApiError("VIDEO_TOO_LONG", undefined, {
        maximumMinutes: Math.floor(this.options.maximumVideoDurationSeconds / 60),
      });
    }

    const options = buildQualityOptions(info);
    if (options.length === 0) {
      throw new ApiError("VIDEO_UNAVAILABLE", "No downloadable formats were found.");
    }

    const infoFilePath = path.join(this.options.inspectionDirectory, `${videoId}.json`);
    await writeFile(infoFilePath, output, "utf8");

    const inspection: Inspection = {
      summary: {
        id: videoId,
        title: info.title?.trim() || info.fulltitle?.trim() || videoId,
        channel: info.channel ?? info.uploader ?? null,
        durationSeconds,
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        sourceUrl: buildWatchUrl(videoId),
      },
      options,
      infoFilePath,
      expiresAt: Date.now() + cacheLifetimeMilliseconds,
    };

    this.remember(videoId, inspection);
    logger.info("Video inspected", {
      videoId,
      optionCount: options.length,
      durationMilliseconds: Date.now() - startedAt,
    });
    return inspection;
  }

  private remember(videoId: string, inspection: Inspection): void {
    this.cache.delete(videoId);
    this.cache.set(videoId, inspection);

    while (this.cache.size > maximumCachedInspections) {
      const oldestVideoId = this.cache.keys().next().value;
      if (oldestVideoId === undefined) break;
      this.invalidate(oldestVideoId);
    }
  }
}
