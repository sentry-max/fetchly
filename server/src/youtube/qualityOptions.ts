import type { YtDlpFormat, YtDlpVideoInfo } from "./videoInfo.js";

export type OptionKind = "video" | "audio";
export type OutputContainer = "mp4" | "m4a" | "mp3";

export interface DownloadPart {
  formatId: string;
  estimatedBytes: number | null;
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
  formatSelector: string;
  parts: DownloadPart[];
  convertToMp3: boolean;
}

export type PublicQualityOption = Omit<QualityOption, "formatSelector" | "parts" | "convertToMp3">;

const highFrameRateThreshold = 50;

function hasCodec(codec: string | null | undefined): codec is string {
  return Boolean(codec) && codec !== "none";
}

function isVideoOnly(format: YtDlpFormat): boolean {
  return hasCodec(format.vcodec) && !hasCodec(format.acodec);
}

function isAudioOnly(format: YtDlpFormat): boolean {
  return hasCodec(format.acodec) && !hasCodec(format.vcodec);
}

function isMuxed(format: YtDlpFormat): boolean {
  return hasCodec(format.acodec) && hasCodec(format.vcodec);
}

function isUsable(format: YtDlpFormat): boolean {
  if (format.has_drm || format.ext === "mhtml") {
    return false;
  }
  if (/premium/i.test(format.format_note ?? "")) {
    return false;
  }
  return Boolean(format.format_id);
}

function protocolRank(format: YtDlpFormat): number {
  const protocol = format.protocol ?? "https";
  return protocol === "https" || protocol === "http" ? 1 : 0;
}

function videoCodecRank(format: YtDlpFormat): number {
  const codec = format.vcodec ?? "";
  if (codec.startsWith("avc1") || codec.startsWith("h264")) return 3;
  if (codec.startsWith("vp9") || codec.startsWith("vp09")) return 2;
  if (codec.startsWith("av01")) return 1;
  return 0;
}

function isHdr(format: YtDlpFormat): boolean {
  return Boolean(format.dynamic_range) && format.dynamic_range !== "SDR";
}

function isHighFrameRate(format: YtDlpFormat): boolean {
  return (format.fps ?? 0) >= highFrameRateThreshold;
}

function audioLanguageRank(format: YtDlpFormat): number {
  const note = (format.format_note ?? "").toLowerCase();
  if (note.includes("original")) return 2;
  if (note.includes("default")) return 1;
  return 0;
}

function isDynamicRangeCompressed(format: YtDlpFormat): boolean {
  return format.format_id.endsWith("-drc") || /\bdrc\b/i.test(format.format_note ?? "");
}

function bitrate(format: YtDlpFormat): number {
  return format.tbr ?? format.abr ?? 0;
}

/** Compares by a list of numeric keys, highest first. */
function compareDescending(left: number[], right: number[]): number {
  for (let index = 0; index < left.length; index += 1) {
    const difference = (right[index] ?? 0) - (left[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

function pickBest(formats: YtDlpFormat[], rank: (format: YtDlpFormat) => number[]): YtDlpFormat | null {
  if (formats.length === 0) {
    return null;
  }
  return [...formats].sort((left, right) => compareDescending(rank(left), rank(right)))[0] ?? null;
}

function bestAudio(formats: YtDlpFormat[]): YtDlpFormat | null {
  return pickBest(formats, (format) => [
    protocolRank(format),
    audioLanguageRank(format),
    isDynamicRangeCompressed(format) ? 0 : 1,
    format.language_preference ?? 0,
    bitrate(format),
  ]);
}

function bestVideo(formats: YtDlpFormat[]): YtDlpFormat | null {
  return pickBest(formats, (format) => [
    protocolRank(format),
    isHdr(format) ? 0 : 1,
    isHighFrameRate(format) ? 1 : 0,
    videoCodecRank(format),
    bitrate(format),
  ]);
}

/**
 * YouTube names qualities after the shorter edge ("1080p" for a vertical 1080x1920 Short),
 * and yt-dlp exposes that label as the format note.
 */
export function qualityLevel(format: YtDlpFormat): number | null {
  const fromNote = /^(\d{3,4})p/.exec(format.format_note ?? "");
  if (fromNote?.[1]) {
    return Number(fromNote[1]);
  }
  if (format.width && format.height) {
    return Math.min(format.width, format.height);
  }
  return format.height ?? null;
}

export function estimateBytes(format: YtDlpFormat | null, durationSeconds: number | null): number | null {
  if (!format) {
    return null;
  }
  const exact = format.filesize ?? format.filesize_approx;
  if (exact && exact > 0) {
    return Math.round(exact);
  }
  if (format.tbr && durationSeconds) {
    return Math.round(((format.tbr * 1000) / 8) * durationSeconds);
  }
  return null;
}

function sumEstimates(values: Array<number | null>): number | null {
  if (values.some((value) => value === null)) {
    return null;
  }
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function buildVideoLabel(level: number, format: YtDlpFormat): string {
  const frameRate = isHighFrameRate(format) ? String(Math.round(format.fps ?? 0)) : "";
  return `${level}p${frameRate}${isHdr(format) ? " HDR" : ""}`;
}

export function buildQualityOptions(info: YtDlpVideoInfo): QualityOption[] {
  const durationSeconds = info.duration ?? null;
  const formats = (info.formats ?? []).filter(isUsable);

  const audioFormats = formats.filter(isAudioOnly);
  const m4aAudio = bestAudio(audioFormats.filter((format) => format.ext === "m4a"));
  const anyAudio = bestAudio(audioFormats);
  const mergeAudio = m4aAudio ?? anyAudio;

  const separateVideo = formats.filter(isVideoOnly);
  const useSeparateStreams = separateVideo.length > 0 && mergeAudio !== null;
  const videoCandidates = useSeparateStreams ? separateVideo : formats.filter(isMuxed);

  const candidatesByLevel = new Map<number, YtDlpFormat[]>();
  for (const format of videoCandidates) {
    const level = qualityLevel(format);
    if (!level) continue;
    const group = candidatesByLevel.get(level) ?? [];
    group.push(format);
    candidatesByLevel.set(level, group);
  }

  const options: QualityOption[] = [];

  for (const level of [...candidatesByLevel.keys()].sort((left, right) => right - left)) {
    const video = bestVideo(candidatesByLevel.get(level) ?? []);
    if (!video) continue;

    const parts: DownloadPart[] =
      useSeparateStreams && mergeAudio
        ? [
            { formatId: video.format_id, estimatedBytes: estimateBytes(video, durationSeconds) },
            { formatId: mergeAudio.format_id, estimatedBytes: estimateBytes(mergeAudio, durationSeconds) },
          ]
        : [{ formatId: video.format_id, estimatedBytes: estimateBytes(video, durationSeconds) }];

    options.push({
      id: `video-${level}`,
      kind: "video",
      label: buildVideoLabel(level, video),
      height: level,
      frameRate: video.fps ? Math.round(video.fps) : null,
      isHdr: isHdr(video),
      container: "mp4",
      estimatedBytes: sumEstimates(parts.map((part) => part.estimatedBytes)),
      formatSelector: parts.map((part) => part.formatId).join("+"),
      parts,
      convertToMp3: false,
    });
  }

  if (m4aAudio) {
    const estimatedBytes = estimateBytes(m4aAudio, durationSeconds);
    options.push({
      id: "audio-m4a",
      kind: "audio",
      label: "M4A",
      height: null,
      frameRate: null,
      isHdr: false,
      container: "m4a",
      estimatedBytes,
      formatSelector: m4aAudio.format_id,
      parts: [{ formatId: m4aAudio.format_id, estimatedBytes }],
      convertToMp3: false,
    });
  }

  if (anyAudio) {
    const sourceBytes = estimateBytes(anyAudio, durationSeconds);
    options.push({
      id: "audio-mp3",
      kind: "audio",
      label: "MP3",
      height: null,
      frameRate: null,
      isHdr: false,
      container: "mp3",
      // VBR V0 averages roughly 245 kbit/s.
      estimatedBytes: durationSeconds ? Math.round(((245 * 1000) / 8) * durationSeconds) : null,
      formatSelector: anyAudio.format_id,
      parts: [{ formatId: anyAudio.format_id, estimatedBytes: sourceBytes }],
      convertToMp3: true,
    });
  }

  return options;
}

export function toPublicOption(option: QualityOption): PublicQualityOption {
  const { formatSelector: _formatSelector, parts: _parts, convertToMp3: _convertToMp3, ...publicFields } = option;
  return publicFields;
}
