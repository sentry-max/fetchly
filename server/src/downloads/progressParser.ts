export type ProcessingStep = "merging" | "converting" | "finalizing";

export interface ProgressSample {
  status: string;
  downloadedBytes: number | null;
  totalBytes: number | null;
  speedBytesPerSecond: number | null;
  etaSeconds: number | null;
  formatId: string | null;
}

const marker = "[fetchly-progress]";

export const progressTemplate = `download:${marker}${[
  "%(progress.status)s",
  "%(progress.downloaded_bytes)s",
  "%(progress.total_bytes)s",
  "%(progress.total_bytes_estimate)s",
  "%(progress.speed)s",
  "%(progress.eta)s",
  "%(info.format_id)s",
].join("|")}`;

function toNumber(value: string | undefined): number | null {
  if (value === undefined || value === "" || value === "NA" || value === "None") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseProgressLine(line: string): ProgressSample | null {
  const start = line.indexOf(marker);
  if (start === -1) {
    return null;
  }

  const [status, downloaded, total, totalEstimate, speed, eta, formatId] = line
    .slice(start + marker.length)
    .trim()
    .split("|");

  return {
    status: status ?? "downloading",
    downloadedBytes: toNumber(downloaded),
    totalBytes: toNumber(total) ?? toNumber(totalEstimate),
    speedBytesPerSecond: toNumber(speed),
    etaSeconds: toNumber(eta),
    formatId: formatId && formatId !== "NA" ? formatId : null,
  };
}

const stepMarkers: Array<[string, ProcessingStep]> = [
  ["[Merger]", "merging"],
  ["[ExtractAudio]", "converting"],
  ["[Metadata]", "finalizing"],
  ["[FixupM4a]", "finalizing"],
  ["[FixupM3u8]", "finalizing"],
  ["[FixupDuplicateMoov]", "finalizing"],
];

export function detectProcessingStep(line: string): ProcessingStep | null {
  for (const [prefix, step] of stepMarkers) {
    if (line.startsWith(prefix)) {
      return step;
    }
  }
  return null;
}
