import { useCallback, useEffect, useRef, useState } from "react";
import { cancelDownloadJob, createDownloadJob, getDownloadJob } from "../api/client";
import type { DownloadJob, JobStatus } from "../api/types";
import { pollIntervalMilliseconds } from "../config";
import { toErrorCode, type DisplayErrorCode } from "../utils/errors";

const terminalStatuses: ReadonlySet<JobStatus> = new Set(["completed", "failed", "cancelled"]);
const maximumConsecutiveNetworkFailures = 5;

export function isActiveJob(job: DownloadJob | null): boolean {
  return job !== null && !terminalStatuses.has(job.status);
}

function triggerBrowserDownload(url: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "";
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export function useDownloadJob() {
  const [job, setJob] = useState<DownloadJob | null>(null);
  const [error, setError] = useState<DisplayErrorCode | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const timerRef = useRef<number | null>(null);
  const activeJobIdRef = useRef<string | null>(null);
  const deliveredJobIdRef = useRef<string | null>(null);
  const networkFailuresRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const poll = useCallback(async (jobId: string): Promise<void> => {
    try {
      const next = await getDownloadJob(jobId);
      if (activeJobIdRef.current !== jobId) return;

      networkFailuresRef.current = 0;
      setJob(next);

      if (next.status === "completed" && next.file && deliveredJobIdRef.current !== jobId) {
        deliveredJobIdRef.current = jobId;
        triggerBrowserDownload(next.file.url);
      }
      if (terminalStatuses.has(next.status)) return;
    } catch (pollError) {
      if (activeJobIdRef.current !== jobId) return;

      const code = toErrorCode(pollError);
      networkFailuresRef.current += 1;
      if (code !== "NETWORK_ERROR" || networkFailuresRef.current >= maximumConsecutiveNetworkFailures) {
        setError(code);
        return;
      }
    }

    timerRef.current = window.setTimeout(() => void poll(jobId), pollIntervalMilliseconds);
  }, []);

  const start = useCallback(
    async (videoId: string, optionId: string) => {
      stopPolling();
      activeJobIdRef.current = null;
      setError(null);
      setJob(null);
      setIsStarting(true);

      try {
        const created = await createDownloadJob(videoId, optionId);
        activeJobIdRef.current = created.id;
        networkFailuresRef.current = 0;
        setJob(created);
        timerRef.current = window.setTimeout(() => void poll(created.id), pollIntervalMilliseconds / 2);
      } catch (startError) {
        setError(toErrorCode(startError));
      } finally {
        setIsStarting(false);
      }
    },
    [poll, stopPolling],
  );

  const cancel = useCallback(async () => {
    const jobId = activeJobIdRef.current;
    stopPolling();
    activeJobIdRef.current = null;
    setJob((current) => (current ? { ...current, status: "cancelled" } : null));

    if (jobId) {
      await cancelDownloadJob(jobId).catch(() => undefined);
    }
  }, [stopPolling]);

  const reset = useCallback(() => {
    stopPolling();
    activeJobIdRef.current = null;
    setJob(null);
    setError(null);
  }, [stopPolling]);

  useEffect(() => stopPolling, [stopPolling]);

  return { job, error, isStarting, start, cancel, reset };
}
