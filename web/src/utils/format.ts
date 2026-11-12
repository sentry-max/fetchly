const byteUnits = ["byte", "kilobyte", "megabyte", "gigabyte"] as const;

function scaleBytes(bytes: number): { value: number; unit: (typeof byteUnits)[number] } {
  let value = Math.max(0, bytes);
  let unitIndex = 0;
  while (value >= 1000 && unitIndex < byteUnits.length - 1) {
    value /= 1000;
    unitIndex += 1;
  }
  return { value, unit: byteUnits[unitIndex] ?? "byte" };
}

function fractionDigits(value: number, unit: string): number {
  return unit === "byte" || unit === "kilobyte" || value >= 100 ? 0 : 1;
}

export function formatBytes(bytes: number, locale: string): string {
  const { value, unit } = scaleBytes(bytes);
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit,
    unitDisplay: "short",
    maximumFractionDigits: fractionDigits(value, unit),
  }).format(value);
}

export function formatSpeed(bytesPerSecond: number, locale: string): string {
  const { value, unit } = scaleBytes(bytesPerSecond);
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: `${unit}-per-second`,
    unitDisplay: "short",
    maximumFractionDigits: fractionDigits(value, unit),
  }).format(value);
}

export function formatInteger(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

export function formatPercent(percent: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(percent / 100);
}

/** Formats as m:ss or h:mm:ss using the locale's digits. */
export function formatDuration(totalSeconds: number, locale: string): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;

  const padded = new Intl.NumberFormat(locale, { minimumIntegerDigits: 2, useGrouping: false });
  const plain = new Intl.NumberFormat(locale, { useGrouping: false });

  return hours > 0
    ? `${plain.format(hours)}:${padded.format(minutes)}:${padded.format(remainder)}`
    : `${plain.format(minutes)}:${padded.format(remainder)}`;
}

export function formatRemainingTime(totalSeconds: number, locale: string): string {
  if (totalSeconds < 60) {
    return new Intl.NumberFormat(locale, { style: "unit", unit: "second", unitDisplay: "short" }).format(
      Math.max(1, Math.round(totalSeconds)),
    );
  }
  if (totalSeconds < 3600) {
    return new Intl.NumberFormat(locale, { style: "unit", unit: "minute", unitDisplay: "short" }).format(
      Math.ceil(totalSeconds / 60),
    );
  }
  return formatDuration(totalSeconds, locale);
}
