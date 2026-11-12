import type { DownloadJob, ErrorCode, InspectionResult } from "./types";

export class RequestError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, status: number, message?: string) {
    super(message ?? code);
    this.name = "RequestError";
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new RequestError("NETWORK_ERROR", 0);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const apiError = (payload as { error?: { code?: ErrorCode; message?: string } } | null)?.error;
    throw new RequestError(apiError?.code ?? "INTERNAL_ERROR", response.status, apiError?.message);
  }

  return payload as T;
}

export function inspectVideo(url: string, signal?: AbortSignal): Promise<InspectionResult> {
  return request<InspectionResult>("/api/videos/inspect", {
    method: "POST",
    body: JSON.stringify({ url }),
    signal: signal ?? null,
  });
}

export async function createDownloadJob(videoId: string, optionId: string): Promise<DownloadJob> {
  const { job } = await request<{ job: DownloadJob }>("/api/jobs", {
    method: "POST",
    body: JSON.stringify({ videoId, optionId }),
  });
  return job;
}

export async function getDownloadJob(jobId: string, signal?: AbortSignal): Promise<DownloadJob> {
  const { job } = await request<{ job: DownloadJob }>(`/api/jobs/${encodeURIComponent(jobId)}`, {
    signal: signal ?? null,
  });
  return job;
}

export function cancelDownloadJob(jobId: string): Promise<void> {
  return request<void>(`/api/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" });
}
