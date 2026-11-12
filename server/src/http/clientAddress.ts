import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

/**
 * Behind Cloudflare (Tunnel or Containers) the visitor address arrives in CF-Connecting-IP.
 * Disable TRUST_PROXY_HEADERS when the server is exposed directly, otherwise the header can be spoofed.
 */
export function resolveClientAddress(context: Context, trustProxyHeaders: boolean): string {
  if (trustProxyHeaders) {
    const forwarded =
      context.req.header("cf-connecting-ip") ?? context.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) {
      return forwarded;
    }
  }

  try {
    return getConnInfo(context).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}
