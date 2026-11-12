import { useCallback, useEffect, useRef, useState } from "react";
import { inspectVideo } from "../api/client";
import type { InspectionResult } from "../api/types";
import { isAbortError, toErrorCode, type DisplayErrorCode } from "../utils/errors";

export type InspectionState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; result: InspectionResult }
  | { status: "error"; error: DisplayErrorCode };

export function useVideoInspection() {
  const [state, setState] = useState<InspectionState>({ status: "idle" });
  const controllerRef = useRef<AbortController | null>(null);

  const inspect = useCallback(async (url: string) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: "loading" });

    try {
      const result = await inspectVideo(url, controller.signal);
      if (!controller.signal.aborted) {
        setState({ status: "ready", result });
      }
    } catch (error) {
      if (!isAbortError(error) && !controller.signal.aborted) {
        setState({ status: "error", error: toErrorCode(error) });
      }
    }
  }, []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    setState({ status: "idle" });
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return { state, inspect, reset };
}
