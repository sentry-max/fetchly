import { Hono } from "hono";
import { z } from "zod";
import { rateLimit, type RateLimiter } from "../http/rateLimiter.js";
import { parseJsonBody } from "../http/validation.js";
import { toPublicOption } from "../youtube/qualityOptions.js";
import type { VideoInspector } from "../youtube/videoInspector.js";
import { extractVideoId } from "../youtube/youtubeUrl.js";

const inspectRequestSchema = z.object({
  url: z.string().trim().min(1).max(2048),
});

interface VideoRoutesDependencies {
  inspector: VideoInspector;
  limiter: RateLimiter;
  trustProxyHeaders: boolean;
}

export function createVideoRoutes({ inspector, limiter, trustProxyHeaders }: VideoRoutesDependencies): Hono {
  const routes = new Hono();

  routes.post("/inspect", rateLimit(limiter, trustProxyHeaders), async (context) => {
    const { url } = await parseJsonBody(context, inspectRequestSchema);
    const inspection = await inspector.inspect(extractVideoId(url));

    return context.json({
      video: inspection.summary,
      options: inspection.options.map(toPublicOption),
    });
  });

  return routes;
}
