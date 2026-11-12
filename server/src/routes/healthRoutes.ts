import { Hono } from "hono";
import type { DownloadManager } from "../downloads/downloadManager.js";

export interface RuntimeStatus {
  ytDlpVersion: string | null;
  ffmpegAvailable: boolean;
}

interface HealthRoutesDependencies {
  downloads: DownloadManager;
  runtimeStatus: RuntimeStatus;
}

export function createHealthRoutes({ downloads, runtimeStatus }: HealthRoutesDependencies): Hono {
  const routes = new Hono();

  routes.get("/", (context) => {
    const ready = runtimeStatus.ytDlpVersion !== null && runtimeStatus.ffmpegAvailable;
    return context.json(
      {
        status: ready ? "ok" : "degraded",
        ytDlp: runtimeStatus.ytDlpVersion,
        ffmpeg: runtimeStatus.ffmpegAvailable,
        downloads: downloads.stats,
      },
      ready ? 200 : 503,
    );
  });

  return routes;
}
