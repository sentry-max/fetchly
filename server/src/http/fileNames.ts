import path from "node:path";
import type { OutputContainer } from "../youtube/qualityOptions.js";

const mimeTypes: Record<OutputContainer | "webm" | "mkv", string> = {
  mp4: "video/mp4",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  webm: "video/webm",
  mkv: "video/x-matroska",
};

export function mimeTypeFor(extension: string): string | null {
  return mimeTypes[extension as keyof typeof mimeTypes] ?? null;
}

export function sanitizeFileName(value: string, maximumLength = 150): string {
  const cleaned = value
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "");

  const characters = Array.from(cleaned);
  const truncated = characters.length > maximumLength ? characters.slice(0, maximumLength).join("").trim() : cleaned;
  return truncated || "video";
}

export function buildDownloadFileName(title: string, qualityLabel: string | null, extension: string): string {
  const base = sanitizeFileName(title);
  return qualityLabel ? `${base} (${qualityLabel}).${extension}` : `${base}.${extension}`;
}

/** RFC 6266 header with an ASCII fallback and a UTF-8 encoded name for non-Latin titles. */
export function buildContentDisposition(fileName: string): string {
  const extension = path.extname(fileName).replace(/[^\x20-\x7e]/g, "");
  const stem = fileName.slice(0, fileName.length - path.extname(fileName).length);
  const asciiStem =
    stem
      .normalize("NFKD")
      .replace(/[^\x20-\x7e]/g, "")
      .replace(/["\\]/g, "")
      .replace(/\s+/g, " ")
      .replace(/^[\s-]+|[\s-]+$/g, "") || "download";
  const asciiFallback = `${asciiStem}${extension}`;

  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
