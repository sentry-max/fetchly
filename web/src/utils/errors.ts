import { RequestError } from "../api/client";
import type { ErrorCode } from "../api/types";

export type DisplayErrorCode = ErrorCode | "UNKNOWN";

export function toErrorCode(error: unknown): DisplayErrorCode {
  return error instanceof RequestError ? error.code : "UNKNOWN";
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
