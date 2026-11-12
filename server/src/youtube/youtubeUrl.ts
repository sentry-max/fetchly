import { ApiError } from "../http/apiError.js";

const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;

const standardHosts = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

const shortLinkHosts = new Set(["youtu.be", "www.youtu.be"]);

const videoPathPrefixes = new Set(["shorts", "live", "embed", "v", "e"]);

export function isVideoId(value: string): boolean {
  return videoIdPattern.test(value);
}

export function buildWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Extracts the 11-character video id from any common YouTube link format.
 * Only the id leaves this function, so arbitrary user input never reaches yt-dlp.
 */
export function extractVideoId(input: string): string {
  const trimmed = input.trim();

  if (isVideoId(trimmed)) {
    return trimmed;
  }

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new ApiError("INVALID_URL");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ApiError("INVALID_URL");
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const segments = url.pathname.split("/").filter(Boolean);
  let candidate: string | undefined;

  if (shortLinkHosts.has(host)) {
    candidate = segments[0];
  } else if (standardHosts.has(host)) {
    if (segments[0] === "watch") {
      candidate = url.searchParams.get("v") ?? undefined;
    } else if (segments[0] && videoPathPrefixes.has(segments[0])) {
      candidate = segments[1];
    }

    if (!candidate && url.searchParams.has("list")) {
      throw new ApiError("PLAYLIST_NOT_SUPPORTED");
    }
  } else {
    throw new ApiError("INVALID_URL");
  }

  if (!candidate || !isVideoId(candidate)) {
    throw new ApiError("INVALID_URL");
  }

  return candidate;
}
