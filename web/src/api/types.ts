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
  | "INTERNAL_ERROR"
  | "NETWORK_ERROR";

export type OptionKind = "video" | "audio";
export type OutputContainer = "mp4" | "m4a" | "mp3";

export interface VideoSummary {
  id: string;
  title: string;
  channel: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string;
  sourceUrl: string;
}

export interface QualityOption {
  id: string;
  kind: OptionKind;
  label: string;
  height: number | null;
  frameRate: number | null;
  isHdr: boolean;
  container: OutputContainer;
  estimatedBytes: number | null;
}

export interface InspectionResult {
  video: VideoSummary;
  options: QualityOption[];
}

export type JobStatus = "queued" | "preparing" | "downloading" | "processing" | "completed" | "failed" | "cancelled";
export type ProcessingStep = "merging" | "converting" | "finalizing";

export interface DownloadJob {
  id: string;
  status: JobStatus;
  queuePosition: number | null;
  processingStep: ProcessingStep | null;
  progress: {
    percent: number | null;
    downloadedBytes: number | null;
    totalBytes: number | null;
    speedBytesPerSecond: number | null;
    etaSeconds: number | null;
  };
  video: { id: string; title: string };
  option: { id: string; label: string; kind: OptionKind; container: OutputContainer };
  file: { name: string; size: number; url: string; expiresAt: string } | null;
  error: { code: ErrorCode; message: string } | null;
}
