import type { ContentfulStatusCode } from "hono/utils/http-status";

export type ErrorCode =
  | "INVALID_URL"
  | "PLAYLIST_NOT_SUPPORTED"
  | "VIDEO_UNAVAILABLE"
  | "PRIVATE_VIDEO"
  | "MEMBERS_ONLY"
  | "AGE_RESTRICTED"
  | "REGION_BLOCKED"
  | "LIVE_NOT_SUPPORTED"
  | "VIDEO_TOO_LONG"
  | "SOURCE_BLOCKED"
  | "OPTION_NOT_AVAILABLE"
  | "RATE_LIMITED"
  | "SERVER_BUSY"
  | "JOB_NOT_FOUND"
  | "FILE_NOT_READY"
  | "FILE_EXPIRED"
  | "INSPECTION_FAILED"
  | "DOWNLOAD_FAILED"
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "INTERNAL_ERROR";

const definitions: Record<ErrorCode, { status: ContentfulStatusCode; message: string }> = {
  INVALID_URL: { status: 400, message: "The link is not a valid YouTube video URL." },
  PLAYLIST_NOT_SUPPORTED: { status: 400, message: "Playlists are not supported. Use a single video link." },
  VIDEO_UNAVAILABLE: { status: 404, message: "The video is unavailable." },
  PRIVATE_VIDEO: { status: 403, message: "The video is private." },
  MEMBERS_ONLY: { status: 403, message: "The video is available to channel members only." },
  AGE_RESTRICTED: { status: 403, message: "The video is age-restricted." },
  REGION_BLOCKED: { status: 403, message: "The video is not available in the server region." },
  LIVE_NOT_SUPPORTED: { status: 422, message: "Live streams and upcoming premieres cannot be downloaded." },
  VIDEO_TOO_LONG: { status: 422, message: "The video exceeds the maximum allowed duration." },
  SOURCE_BLOCKED: { status: 503, message: "YouTube is temporarily refusing requests from this server." },
  OPTION_NOT_AVAILABLE: { status: 409, message: "The selected format is not available for this video." },
  RATE_LIMITED: { status: 429, message: "Too many requests. Try again later." },
  SERVER_BUSY: { status: 503, message: "The download queue is full. Try again in a few minutes." },
  JOB_NOT_FOUND: { status: 404, message: "The download job does not exist or has expired." },
  FILE_NOT_READY: { status: 409, message: "The file is not ready yet." },
  FILE_EXPIRED: { status: 410, message: "The file has expired." },
  INSPECTION_FAILED: { status: 502, message: "The video information could not be retrieved." },
  DOWNLOAD_FAILED: { status: 502, message: "The download failed." },
  VALIDATION_FAILED: { status: 400, message: "The request body is invalid." },
  NOT_FOUND: { status: 404, message: "The requested resource was not found." },
  INTERNAL_ERROR: { status: 500, message: "An unexpected error occurred." },
};

export class ApiError extends Error {
  override name = "ApiError";
  readonly code: ErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>) {
    super(message ?? definitions[code].message);
    this.code = code;
    this.details = details;
  }

  get status(): ContentfulStatusCode {
    return definitions[this.code].status;
  }

  toJSON(): { code: ErrorCode; message: string; details?: Record<string, unknown> } {
    return {
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}
