import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { ApiError, type ErrorCode } from "../http/apiError.js";
import { buildDownloadFileName } from "../http/fileNames.js";
import { logger } from "../logger.js";
import { classifyFailure, killProcessGroup, lastErrorLine, type YtDlp, type YtDlpProcess } from "../process/ytDlp.js";
import type { OptionKind, OutputContainer } from "../youtube/qualityOptions.js";
import type { VideoInspector } from "../youtube/videoInspector.js";
import { buildWatchUrl } from "../youtube/youtubeUrl.js";
import {
  detectProcessingStep,
  parseProgressLine,
  progressTemplate,
  type ProcessingStep,
  type ProgressSample,
} from "./progressParser.js";

export type JobStatus = "queued" | "preparing" | "downloading" | "processing" | "completed" | "failed" | "cancelled";

const activeStatuses: ReadonlySet<JobStatus> = new Set(["queued", "preparing", "downloading", "processing"]);
const runningStatuses: ReadonlySet<JobStatus> = new Set(["preparing", "downloading", "processing"]);

export interface JobProgress {
  percent: number | null;
  downloadedBytes: number | null;
  totalBytes: number | null;
  speedBytesPerSecond: number | null;
  etaSeconds: number | null;
}

interface PartState {
  formatId: string;
  weight: number;
  estimatedBytes: number | null;
  downloadedBytes: number;
  totalBytes: number | null;
  finished: boolean;
}

export interface DownloadJob {
  id: string;
  clientAddress: string;
  videoId: string;
  title: string;
  optionId: string;
  optionLabel: string;
  kind: OptionKind;
  container: OutputContainer;
  formatSelector: string;
  convertToMp3: boolean;
  status: JobStatus;
  processingStep: ProcessingStep | null;
  progress: JobProgress;
  parts: PartState[];
  workingDirectory: string;
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  error: ApiError | null;
  process: YtDlpProcess | null;
  createdAt: number;
  updatedAt: number;
  lastSeenAt: number;
  completedAt: number | null;
}

export interface PublicJob {
  id: string;
  status: JobStatus;
  queuePosition: number | null;
  processingStep: ProcessingStep | null;
  progress: JobProgress;
  video: { id: string; title: string };
  option: { id: string; label: string; kind: OptionKind; container: OutputContainer };
  file: { name: string; size: number; url: string; expiresAt: string } | null;
  error: { code: ErrorCode; message: string } | null;
}

interface DownloadManagerOptions {
  ytDlp: YtDlp;
  inspector: VideoInspector;
  downloadDirectory: string;
  maximumConcurrentDownloads: number;
  maximumQueuedDownloads: number;
  maximumActiveDownloadsPerClient: number;
  fileRetentionSeconds: number;
}

interface AttemptResult {
  exitCode: number | null;
  stderrTail: string;
  usedCachedInfo: boolean;
}

const abandonedAfterMilliseconds = 2 * 60 * 1000;
const finishedJobLifetimeMilliseconds = 10 * 60 * 1000;
const terminationGraceMilliseconds = 5_000;
const stderrTailLimit = 16 * 1024;
const temporaryFilePattern = /\.(part|ytdl|temp|tmp)$|\.part-Frag\d+|\.f\d+\./;

function emptyProgress(): JobProgress {
  return { percent: null, downloadedBytes: null, totalBytes: null, speedBytesPerSecond: null, etaSeconds: null };
}

export class DownloadManager {
  private readonly jobs = new Map<string, DownloadJob>();
  private readonly queue: string[] = [];
  private readonly options: DownloadManagerOptions;
  private runningCount = 0;
  private acceptingJobs = true;

  constructor(options: DownloadManagerOptions) {
    this.options = options;
  }

  get stats(): { running: number; queued: number } {
    return { running: this.runningCount, queued: this.queue.length };
  }

  async create(request: { videoId: string; optionId: string; clientAddress: string }): Promise<DownloadJob> {
    if (!this.acceptingJobs) {
      throw new ApiError("SERVER_BUSY");
    }

    const activeForClient = [...this.jobs.values()].filter(
      (job) => job.clientAddress === request.clientAddress && activeStatuses.has(job.status),
    ).length;
    if (activeForClient >= this.options.maximumActiveDownloadsPerClient) {
      throw new ApiError("RATE_LIMITED", "Finish or cancel your current downloads before starting another one.");
    }

    if (
      this.runningCount >= this.options.maximumConcurrentDownloads &&
      this.queue.length >= this.options.maximumQueuedDownloads
    ) {
      throw new ApiError("SERVER_BUSY");
    }

    const inspection = await this.options.inspector.inspect(request.videoId);
    const option = inspection.options.find((candidate) => candidate.id === request.optionId);
    if (!option) {
      throw new ApiError("OPTION_NOT_AVAILABLE");
    }

    const knownEstimates = option.parts.map((part) => part.estimatedBytes ?? 0);
    const estimateTotal = knownEstimates.reduce((total, value) => total + value, 0);
    const allEstimatesKnown = option.parts.every((part) => part.estimatedBytes !== null);

    const id = randomUUID();
    const workingDirectory = path.join(this.options.downloadDirectory, id);
    await mkdir(workingDirectory, { recursive: true });

    const now = Date.now();
    const job: DownloadJob = {
      id,
      clientAddress: request.clientAddress,
      videoId: request.videoId,
      title: inspection.summary.title,
      optionId: option.id,
      optionLabel: option.label,
      kind: option.kind,
      container: option.container,
      formatSelector: option.formatSelector,
      convertToMp3: option.convertToMp3,
      status: "queued",
      processingStep: null,
      progress: emptyProgress(),
      parts: option.parts.map((part, index) => ({
        formatId: part.formatId,
        weight:
          allEstimatesKnown && estimateTotal > 0
            ? (knownEstimates[index] ?? 0) / estimateTotal
            : 1 / option.parts.length,
        estimatedBytes: part.estimatedBytes,
        downloadedBytes: 0,
        totalBytes: null,
        finished: false,
      })),
      workingDirectory,
      filePath: null,
      fileName: null,
      fileSize: null,
      error: null,
      process: null,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
      completedAt: null,
    };

    this.jobs.set(id, job);
    this.queue.push(id);
    logger.info("Download queued", { jobId: id, videoId: job.videoId, option: job.optionId });
    this.pump();
    return job;
  }

  get(jobId: string): DownloadJob | null {
    const job = this.jobs.get(jobId) ?? null;
    if (job) {
      job.lastSeenAt = Date.now();
    }
    return job;
  }

  async cancel(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new ApiError("JOB_NOT_FOUND");
    }

    if (job.status === "queued") {
      this.queue.splice(this.queue.indexOf(jobId), 1);
      this.markCancelled(job);
      await this.removeWorkingDirectory(job);
      return;
    }

    if (runningStatuses.has(job.status)) {
      this.markCancelled(job);
      if (job.process) {
        this.terminate(job.process);
      }
      return;
    }

    this.jobs.delete(jobId);
    await this.removeWorkingDirectory(job);
  }

  toPublic(job: DownloadJob): PublicJob {
    const queueIndex = job.status === "queued" ? this.queue.indexOf(job.id) : -1;
    return {
      id: job.id,
      status: job.status,
      queuePosition: queueIndex >= 0 ? queueIndex + 1 : null,
      processingStep: job.processingStep,
      progress: job.progress,
      video: { id: job.videoId, title: job.title },
      option: { id: job.optionId, label: job.optionLabel, kind: job.kind, container: job.container },
      file:
        job.status === "completed" && job.fileName && job.fileSize !== null && job.completedAt
          ? {
              name: job.fileName,
              size: job.fileSize,
              url: `/api/jobs/${job.id}/file`,
              expiresAt: new Date(job.completedAt + this.options.fileRetentionSeconds * 1000).toISOString(),
            }
          : null,
      error: job.error ? { code: job.error.code, message: job.error.message } : null,
    };
  }

  /** Expires finished files and cancels downloads nobody is polling any more. */
  async sweep(): Promise<void> {
    const now = Date.now();
    for (const job of [...this.jobs.values()]) {
      if (activeStatuses.has(job.status) && now - job.lastSeenAt > abandonedAfterMilliseconds) {
        logger.info("Cancelling abandoned download", { jobId: job.id });
        await this.cancel(job.id);
      } else if (job.status === "completed" && job.completedAt) {
        if (now - job.completedAt > this.options.fileRetentionSeconds * 1000) {
          this.jobs.delete(job.id);
          await this.removeWorkingDirectory(job);
        }
      } else if (
        (job.status === "failed" || job.status === "cancelled") &&
        now - job.updatedAt > finishedJobLifetimeMilliseconds
      ) {
        this.jobs.delete(job.id);
      }
    }
  }

  async shutdown(): Promise<void> {
    this.acceptingJobs = false;
    this.queue.length = 0;
    const jobs = [...this.jobs.values()];
    for (const job of jobs) {
      if (job.process) {
        killProcessGroup(job.process, "SIGKILL");
      }
    }
    await Promise.all(jobs.map((job) => this.removeWorkingDirectory(job)));
    this.jobs.clear();
  }

  private pump(): void {
    while (this.runningCount < this.options.maximumConcurrentDownloads && this.queue.length > 0) {
      const jobId = this.queue.shift();
      const job = jobId ? this.jobs.get(jobId) : undefined;
      if (!job || job.status !== "queued") {
        continue;
      }

      this.runningCount += 1;
      void this.execute(job)
        .catch(async (error: unknown) => {
          this.fail(job, error);
          await this.removeWorkingDirectory(job);
        })
        .finally(() => {
          this.runningCount -= 1;
          this.pump();
        });
    }
  }

  private async execute(job: DownloadJob): Promise<void> {
    this.update(job, { status: "preparing" });

    let result = await this.runAttempt(job, true);
    const failure = result.exitCode === 0 ? null : classifyFailure(result.stderrTail, "DOWNLOAD_FAILED");

    // Cached stream URLs can be rejected by YouTube; a fresh extraction usually succeeds.
    if (
      failure &&
      result.usedCachedInfo &&
      !this.isCancelled(job) &&
      (failure.code === "DOWNLOAD_FAILED" || failure.code === "OPTION_NOT_AVAILABLE")
    ) {
      logger.warn("Retrying download with fresh metadata", { jobId: job.id, cause: lastErrorLine(result.stderrTail) });
      this.options.inspector.invalidate(job.videoId);
      this.resetProgress(job);
      result = await this.runAttempt(job, false);
    }

    if (this.isCancelled(job)) {
      await this.removeWorkingDirectory(job);
      return;
    }

    if (result.exitCode !== 0) {
      const finalFailure = classifyFailure(result.stderrTail, "DOWNLOAD_FAILED");
      this.fail(job, Object.assign(finalFailure, { cause: lastErrorLine(result.stderrTail) }));
      await this.removeWorkingDirectory(job);
      return;
    }

    await this.complete(job);
  }

  private runAttempt(job: DownloadJob, preferCachedInfo: boolean): Promise<AttemptResult> {
    const inspection = this.options.inspector.getCached(job.videoId);
    const usedCachedInfo = preferCachedInfo && inspection !== null && existsSync(inspection.infoFilePath);
    const source =
      usedCachedInfo && inspection ? ["--load-info-json", inspection.infoFilePath] : [buildWatchUrl(job.videoId)];

    const argumentsList = [
      "--newline",
      "--progress",
      "--progress-template",
      progressTemplate,
      "--progress-delta",
      "0.5",
      "--no-mtime",
      "--format",
      job.formatSelector,
      "--output",
      path.join(job.workingDirectory, "media.%(ext)s"),
      ...(job.container === "mp4" ? ["--merge-output-format", "mp4"] : []),
      ...(job.convertToMp3 ? ["--extract-audio", "--audio-format", "mp3", "--audio-quality", "0"] : []),
      ...(job.kind === "audio" ? ["--embed-metadata"] : []),
      ...source,
    ];

    return new Promise((resolve) => {
      const child = this.options.ytDlp.spawn(argumentsList);
      job.process = child;
      let stderrTail = "";

      const handleLine = (line: string): void => {
        const sample = parseProgressLine(line);
        if (sample) {
          this.applyProgress(job, sample);
          return;
        }
        const step = detectProcessingStep(line);
        if (step && !this.isCancelled(job)) {
          this.update(job, {
            status: "processing",
            processingStep: step,
            progress: { ...job.progress, speedBytesPerSecond: null, etaSeconds: null },
          });
        }
      };

      readline.createInterface({ input: child.stdout }).on("line", handleLine);
      readline.createInterface({ input: child.stderr }).on("line", (line) => {
        stderrTail = `${stderrTail}${line}\n`.slice(-stderrTailLimit);
        handleLine(line);
      });

      child.on("error", (error) => {
        stderrTail += `ERROR: ${error.message}\n`;
      });

      child.on("close", (exitCode) => {
        job.process = null;
        resolve({ exitCode, stderrTail, usedCachedInfo });
      });
    });
  }

  private applyProgress(job: DownloadJob, sample: ProgressSample): void {
    if (this.isCancelled(job) || job.status === "processing") {
      return;
    }

    let partIndex = sample.formatId ? job.parts.findIndex((part) => part.formatId === sample.formatId) : -1;
    if (partIndex === -1) {
      partIndex = Math.max(
        0,
        job.parts.findIndex((part) => !part.finished),
      );
    }

    const part = job.parts[partIndex];
    if (!part) {
      return;
    }

    if (sample.downloadedBytes !== null) part.downloadedBytes = sample.downloadedBytes;
    if (sample.totalBytes !== null) part.totalBytes = sample.totalBytes;
    if (sample.status === "finished") {
      part.finished = true;
      part.totalBytes = part.totalBytes ?? part.downloadedBytes;
    }

    const partFraction = part.finished
      ? 1
      : part.totalBytes && part.totalBytes > 0
        ? Math.min(1, part.downloadedBytes / part.totalBytes)
        : null;

    const completedWeight = job.parts
      .filter((candidate, index) => candidate.finished && index !== partIndex)
      .reduce((total, candidate) => total + candidate.weight, 0);

    const percent =
      partFraction === null
        ? null
        : Math.min(100, Math.round((completedWeight + part.weight * partFraction) * 1000) / 10);

    const totals = job.parts.map((candidate) => candidate.totalBytes ?? candidate.estimatedBytes);
    const totalBytes = totals.every((value) => value !== null)
      ? totals.reduce<number>((total, value) => total + (value ?? 0), 0)
      : null;
    const downloadedBytes = job.parts.reduce(
      (total, candidate) =>
        total + (candidate.finished ? (candidate.totalBytes ?? candidate.downloadedBytes) : candidate.downloadedBytes),
      0,
    );

    this.update(job, {
      status: "downloading",
      progress: {
        percent,
        downloadedBytes,
        totalBytes: totalBytes !== null ? Math.max(totalBytes, downloadedBytes) : null,
        speedBytesPerSecond: sample.speedBytesPerSecond,
        etaSeconds: sample.etaSeconds !== null ? Math.round(sample.etaSeconds) : null,
      },
    });
  }

  private async complete(job: DownloadJob): Promise<void> {
    const entries = await readdir(job.workingDirectory);
    const mediaFile =
      entries.find((name) => name === `media.${job.container}`) ??
      entries.find((name) => name.startsWith("media.") && !temporaryFilePattern.test(name));

    if (!mediaFile) {
      this.fail(job, new ApiError("DOWNLOAD_FAILED", "yt-dlp finished without producing a file."));
      await this.removeWorkingDirectory(job);
      return;
    }

    const filePath = path.join(job.workingDirectory, mediaFile);
    const fileStats = await stat(filePath);
    const extension = path.extname(mediaFile).slice(1) || job.container;

    this.update(job, {
      status: "completed",
      processingStep: null,
      filePath,
      fileSize: fileStats.size,
      fileName: buildDownloadFileName(job.title, job.kind === "video" ? job.optionLabel : null, extension),
      completedAt: Date.now(),
      progress: {
        percent: 100,
        downloadedBytes: fileStats.size,
        totalBytes: fileStats.size,
        speedBytesPerSecond: null,
        etaSeconds: null,
      },
    });
    logger.info("Download completed", { jobId: job.id, videoId: job.videoId, bytes: fileStats.size });
  }

  private fail(job: DownloadJob, error: unknown): void {
    if (this.isCancelled(job)) {
      return;
    }
    const apiError = error instanceof ApiError ? error : new ApiError("DOWNLOAD_FAILED");
    this.update(job, { status: "failed", processingStep: null, error: apiError });
    logger.warn("Download failed", {
      jobId: job.id,
      videoId: job.videoId,
      code: apiError.code,
      cause: error instanceof Error ? (error.cause ?? error.message) : String(error),
    });
  }

  private markCancelled(job: DownloadJob): void {
    this.update(job, { status: "cancelled", processingStep: null });
    logger.info("Download cancelled", { jobId: job.id });
  }

  private isCancelled(job: DownloadJob): boolean {
    return job.status === "cancelled";
  }

  private resetProgress(job: DownloadJob): void {
    for (const part of job.parts) {
      part.downloadedBytes = 0;
      part.totalBytes = null;
      part.finished = false;
    }
    this.update(job, { status: "preparing", processingStep: null, progress: emptyProgress() });
  }

  private update(job: DownloadJob, changes: Partial<DownloadJob>): void {
    Object.assign(job, changes, { updatedAt: Date.now() });
  }

  /** yt-dlp starts ffmpeg as a child, so the whole process group is signalled. */
  private terminate(child: YtDlpProcess): void {
    killProcessGroup(child, "SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        killProcessGroup(child, "SIGKILL");
      }
    }, terminationGraceMilliseconds).unref();
  }

  private async removeWorkingDirectory(job: DownloadJob): Promise<void> {
    await rm(job.workingDirectory, { recursive: true, force: true }).catch((error: unknown) => {
      logger.warn("Could not remove working directory", { jobId: job.id, error });
    });
  }
}
