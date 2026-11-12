import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { Hono } from "hono";
import { z } from "zod";
import type { DownloadJob, DownloadManager } from "../downloads/downloadManager.js";
import { ApiError } from "../http/apiError.js";
import { resolveClientAddress } from "../http/clientAddress.js";
import { buildContentDisposition, mimeTypeFor } from "../http/fileNames.js";
import { rateLimit, type RateLimiter } from "../http/rateLimiter.js";
import { parseJsonBody } from "../http/validation.js";

const createJobSchema = z.object({
  videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  optionId: z.string().regex(/^(video-\d{3,4}|audio-(m4a|mp3))$/),
});

const jobIdSchema = z.uuid();

interface JobRoutesDependencies {
  downloads: DownloadManager;
  limiter: RateLimiter;
  trustProxyHeaders: boolean;
}

interface ByteRange {
  start: number;
  end: number;
}

/** Supports a single "bytes=start-end" range so interrupted downloads can resume. */
function parseRange(header: string | undefined, size: number): ByteRange | "unsatisfiable" | null {
  if (!header) {
    return null;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) {
    return null;
  }

  const [, startText = "", endText = ""] = match;
  let start: number;
  let end: number;

  if (startText === "") {
    const suffixLength = Number(endText);
    if (suffixLength === 0) return "unsatisfiable";
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(startText);
    end = endText === "" ? size - 1 : Math.min(Number(endText), size - 1);
  }

  if (start >= size || start > end) {
    return "unsatisfiable";
  }
  return { start, end };
}

export function createJobRoutes({ downloads, limiter, trustProxyHeaders }: JobRoutesDependencies): Hono {
  const routes = new Hono();

  const requireJob = (jobId: string): DownloadJob => {
    const job = jobIdSchema.safeParse(jobId).success ? downloads.get(jobId) : null;
    if (!job) {
      throw new ApiError("JOB_NOT_FOUND");
    }
    return job;
  };

  routes.post("/", rateLimit(limiter, trustProxyHeaders), async (context) => {
    const { videoId, optionId } = await parseJsonBody(context, createJobSchema);
    const job = await downloads.create({
      videoId,
      optionId,
      clientAddress: resolveClientAddress(context, trustProxyHeaders),
    });
    return context.json({ job: downloads.toPublic(job) }, 202);
  });

  routes.get("/:jobId", (context) => {
    const job = requireJob(context.req.param("jobId"));
    return context.json({ job: downloads.toPublic(job) });
  });

  routes.delete("/:jobId", async (context) => {
    requireJob(context.req.param("jobId"));
    await downloads.cancel(context.req.param("jobId"));
    return context.body(null, 204);
  });

  routes.on(["GET", "HEAD"], "/:jobId/file", async (context) => {
    const job = requireJob(context.req.param("jobId"));

    if (job.status !== "completed" || !job.filePath || !job.fileName) {
      throw new ApiError(job.status === "failed" || job.status === "cancelled" ? "FILE_EXPIRED" : "FILE_NOT_READY");
    }

    const fileStats = await stat(job.filePath).catch(() => {
      throw new ApiError("FILE_EXPIRED");
    });

    const size = fileStats.size;
    const extension = path.extname(job.filePath).slice(1);
    const range = parseRange(context.req.header("range"), size);

    context.header("Content-Type", mimeTypeFor(extension) ?? "application/octet-stream");
    context.header("Content-Disposition", buildContentDisposition(job.fileName));
    context.header("Accept-Ranges", "bytes");
    context.header("Cache-Control", "private, no-store");
    context.header("Last-Modified", fileStats.mtime.toUTCString());

    if (range === "unsatisfiable") {
      context.header("Content-Range", `bytes */${size}`);
      return context.body(null, 416);
    }

    const { start, end } = range ?? { start: 0, end: size - 1 };
    const status = range ? 206 : 200;
    context.header("Content-Length", String(size === 0 ? 0 : end - start + 1));
    if (range) {
      context.header("Content-Range", `bytes ${start}-${end}/${size}`);
    }

    if (context.req.method === "HEAD" || size === 0) {
      return context.body(null, status);
    }

    const stream = createReadStream(job.filePath, { start, end });
    return context.body(Readable.toWeb(stream) as ReadableStream<Uint8Array>, status);
  });

  return routes;
}
