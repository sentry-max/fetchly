import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import type { AppConfig } from "./config.js";
import type { DownloadManager } from "./downloads/downloadManager.js";
import { ApiError } from "./http/apiError.js";
import { RateLimiter } from "./http/rateLimiter.js";
import { logger } from "./logger.js";
import { createHealthRoutes, type RuntimeStatus } from "./routes/healthRoutes.js";
import { createJobRoutes } from "./routes/jobRoutes.js";
import { createVideoRoutes } from "./routes/videoRoutes.js";
import type { VideoInspector } from "./youtube/videoInspector.js";

export interface AppDependencies {
  config: AppConfig;
  inspector: VideoInspector;
  downloads: DownloadManager;
  runtimeStatus: RuntimeStatus;
  inspectLimiter: RateLimiter;
  downloadLimiter: RateLimiter;
}

const oneHour = 60 * 60 * 1000;

export function createRateLimiters(config: AppConfig): { inspectLimiter: RateLimiter; downloadLimiter: RateLimiter } {
  return {
    inspectLimiter: new RateLimiter(config.inspectRequestsPerHour, oneHour),
    downloadLimiter: new RateLimiter(config.downloadRequestsPerHour, oneHour),
  };
}

function registerStaticRoutes(app: Hono, root: string): void {
  const assets = serveStatic({
    root,
    onFound: (_path, context) => context.header("Cache-Control", "public, max-age=31536000, immutable"),
  });
  const publicFiles = serveStatic({
    root,
    onFound: (filePath, context) =>
      context.header("Cache-Control", filePath.endsWith(".html") ? "no-cache" : "public, max-age=3600"),
  });
  const applicationShell = serveStatic({
    root,
    path: "index.html",
    onFound: (_path, context) => context.header("Cache-Control", "no-cache"),
  });

  app.use("/assets/*", assets);
  // Files prefixed with "_" are platform configuration (for example Cloudflare's _headers), not content.
  app.use("*", (context, next) => (context.req.path.startsWith("/_") ? next() : publicFiles(context, next)));
  app.get("*", applicationShell);
}

export function createApp(dependencies: AppDependencies): Hono {
  const { config, inspector, downloads, runtimeStatus, inspectLimiter, downloadLimiter } = dependencies;
  const app = new Hono();

  app.use(
    "*",
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https://i.ytimg.com"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: "strict-origin-when-cross-origin",
      xFrameOptions: "DENY",
    }),
  );

  app.use("/api/*", async (context, next) => {
    context.header("Cache-Control", "no-store");
    await next();
  });

  app.use(
    "/api/*",
    bodyLimit({
      maxSize: 16 * 1024,
      onError: () => {
        throw new ApiError("VALIDATION_FAILED", "The request body is too large.");
      },
    }),
  );

  app.route("/api/health", createHealthRoutes({ downloads, runtimeStatus }));
  app.route(
    "/api/videos",
    createVideoRoutes({ inspector, limiter: inspectLimiter, trustProxyHeaders: config.trustProxyHeaders }),
  );
  app.route(
    "/api/jobs",
    createJobRoutes({ downloads, limiter: downloadLimiter, trustProxyHeaders: config.trustProxyHeaders }),
  );

  app.all("/api/*", () => {
    throw new ApiError("NOT_FOUND");
  });

  if (config.staticDirectory) {
    registerStaticRoutes(app, config.staticDirectory);
  }

  app.notFound((context) => context.json({ error: new ApiError("NOT_FOUND").toJSON() }, 404));

  app.onError((error, context) => {
    if (error instanceof ApiError) {
      if (error.status >= 500) {
        logger.warn("Request failed", {
          method: context.req.method,
          path: context.req.path,
          code: error.code,
          cause: error.cause ?? error.message,
        });
      }
      return context.json({ error: error.toJSON() }, error.status);
    }

    logger.error("Unhandled request error", { method: context.req.method, path: context.req.path, error });
    return context.json({ error: new ApiError("INTERNAL_ERROR").toJSON() }, 500);
  });

  return app;
}
