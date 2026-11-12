import type { MiddlewareHandler } from "hono";
import { ApiError } from "./apiError.js";
import { resolveClientAddress } from "./clientAddress.js";

/** In-memory sliding-window limiter. Suitable for a single instance. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly limit: number;
  private readonly windowMilliseconds: number;

  constructor(limit: number, windowMilliseconds: number) {
    this.limit = limit;
    this.windowMilliseconds = windowMilliseconds;
  }

  consume(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.now();
    const windowStart = now - this.windowMilliseconds;
    const timestamps = (this.hits.get(key) ?? []).filter((timestamp) => timestamp > windowStart);

    if (timestamps.length >= this.limit) {
      this.hits.set(key, timestamps);
      const oldest = timestamps[0] ?? now;
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((oldest + this.windowMilliseconds - now) / 1000)),
      };
    }

    timestamps.push(now);
    this.hits.set(key, timestamps);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  prune(): void {
    const windowStart = Date.now() - this.windowMilliseconds;
    for (const [key, timestamps] of this.hits) {
      const recent = timestamps.filter((timestamp) => timestamp > windowStart);
      if (recent.length === 0) {
        this.hits.delete(key);
      } else {
        this.hits.set(key, recent);
      }
    }
  }
}

export function rateLimit(limiter: RateLimiter, trustProxyHeaders: boolean): MiddlewareHandler {
  return async (context, next) => {
    const result = limiter.consume(resolveClientAddress(context, trustProxyHeaders));
    if (!result.allowed) {
      context.header("Retry-After", String(result.retryAfterSeconds));
      throw new ApiError("RATE_LIMITED", undefined, { retryAfterSeconds: result.retryAfterSeconds });
    }
    await next();
  };
}
