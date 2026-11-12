import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildQualityOptions, toPublicOption } from "../src/youtube/qualityOptions.js";
import type { YtDlpFormat, YtDlpVideoInfo } from "../src/youtube/videoInfo.js";

function format(overrides: Partial<YtDlpFormat> & { format_id: string }): YtDlpFormat {
  return { protocol: "https", ...overrides };
}

const formats: YtDlpFormat[] = [
  format({ format_id: "sb0", ext: "mhtml", vcodec: "none", acodec: "none", format_note: "storyboard" }),
  format({
    format_id: "139",
    ext: "m4a",
    acodec: "mp4a.40.5",
    vcodec: "none",
    abr: 48,
    filesize: 1_000_000,
    format_note: "low",
  }),
  format({
    format_id: "140",
    ext: "m4a",
    acodec: "mp4a.40.2",
    vcodec: "none",
    abr: 129,
    filesize: 3_000_000,
    format_note: "medium",
  }),
  format({
    format_id: "140-drc",
    ext: "m4a",
    acodec: "mp4a.40.2",
    vcodec: "none",
    abr: 129,
    filesize: 3_000_000,
    format_note: "medium, DRC",
  }),
  format({
    format_id: "251",
    ext: "webm",
    acodec: "opus",
    vcodec: "none",
    abr: 160,
    filesize: 3_500_000,
    format_note: "medium",
  }),
  format({
    format_id: "18",
    ext: "mp4",
    vcodec: "avc1.42001E",
    acodec: "mp4a.40.2",
    height: 360,
    width: 640,
    format_note: "360p",
    tbr: 500,
  }),
  format({
    format_id: "134",
    ext: "mp4",
    vcodec: "avc1.4d401e",
    acodec: "none",
    height: 360,
    width: 640,
    fps: 30,
    format_note: "360p",
    filesize: 5_000_000,
  }),
  format({
    format_id: "243",
    ext: "webm",
    vcodec: "vp9",
    acodec: "none",
    height: 360,
    width: 640,
    fps: 30,
    format_note: "360p",
    filesize: 4_000_000,
  }),
  format({
    format_id: "136",
    ext: "mp4",
    vcodec: "avc1.4d401f",
    acodec: "none",
    height: 720,
    width: 1280,
    fps: 30,
    format_note: "720p",
    filesize: 15_000_000,
  }),
  format({
    format_id: "298",
    ext: "mp4",
    vcodec: "avc1.4d4020",
    acodec: "none",
    height: 720,
    width: 1280,
    fps: 60,
    format_note: "720p60",
    filesize: 20_000_000,
  }),
  format({
    format_id: "302",
    ext: "webm",
    vcodec: "vp9",
    acodec: "none",
    height: 720,
    width: 1280,
    fps: 60,
    format_note: "720p60",
    filesize: 18_000_000,
  }),
  format({
    format_id: "137",
    ext: "mp4",
    vcodec: "avc1.640028",
    acodec: "none",
    height: 1080,
    width: 1920,
    fps: 30,
    format_note: "1080p",
    filesize: 40_000_000,
  }),
  format({
    format_id: "299",
    ext: "mp4",
    vcodec: "avc1.64002a",
    acodec: "none",
    height: 1080,
    width: 1920,
    fps: 60,
    format_note: "1080p60",
    filesize: 60_000_000,
  }),
  format({
    format_id: "308",
    ext: "webm",
    vcodec: "vp9",
    acodec: "none",
    height: 1440,
    width: 2560,
    fps: 60,
    format_note: "1440p60",
    filesize: 120_000_000,
  }),
  format({
    format_id: "336",
    ext: "webm",
    vcodec: "vp09.02.51.10",
    acodec: "none",
    height: 1440,
    width: 2560,
    fps: 60,
    format_note: "1440p60 HDR",
    dynamic_range: "HDR10",
    filesize: 150_000_000,
  }),
  format({
    format_id: "401",
    ext: "mp4",
    vcodec: "av01.0.12M.08",
    acodec: "none",
    height: 2160,
    width: 3840,
    fps: 60,
    format_note: "2160p60",
    filesize: 300_000_000,
  }),
  format({
    format_id: "999",
    ext: "mp4",
    vcodec: "avc1",
    acodec: "none",
    height: 1080,
    width: 1920,
    format_note: "1080p Premium",
    filesize: 90_000_000,
  }),
  format({
    format_id: "drm",
    ext: "mp4",
    vcodec: "avc1",
    acodec: "none",
    height: 1080,
    width: 1920,
    format_note: "1080p",
    has_drm: true,
  }),
];

const info: YtDlpVideoInfo = { id: "dQw4w9WgXcQ", title: "Sample", duration: 213, formats };

describe("buildQualityOptions", () => {
  const options = buildQualityOptions(info);
  const byId = new Map(options.map((option) => [option.id, option]));

  it("lists one option per resolution, highest first, followed by audio", () => {
    assert.deepEqual(
      options.map((option) => option.id),
      ["video-2160", "video-1440", "video-1080", "video-720", "video-360", "audio-m4a", "audio-mp3"],
    );
  });

  it("prefers high frame rate, then H.264 for compatibility", () => {
    assert.equal(byId.get("video-1080")?.formatSelector, "299+140");
    assert.equal(byId.get("video-1080")?.label, "1080p60");
    assert.equal(byId.get("video-720")?.formatSelector, "298+140");
    assert.equal(byId.get("video-360")?.formatSelector, "134+140");
  });

  it("prefers SDR over HDR at the same resolution", () => {
    assert.equal(byId.get("video-1440")?.formatSelector, "308+140");
    assert.equal(byId.get("video-1440")?.isHdr, false);
  });

  it("skips premium, DRM and storyboard formats", () => {
    const selectors = options.map((option) => option.formatSelector).join(",");
    assert.ok(!selectors.includes("999"));
    assert.ok(!selectors.includes("drm"));
    assert.ok(!selectors.includes("sb0"));
  });

  it("avoids dynamic range compressed audio", () => {
    assert.equal(byId.get("audio-m4a")?.formatSelector, "140");
  });

  it("converts the highest bitrate audio to MP3", () => {
    const mp3 = byId.get("audio-mp3");
    assert.equal(mp3?.formatSelector, "251");
    assert.equal(mp3?.convertToMp3, true);
  });

  it("adds video and audio sizes together", () => {
    assert.equal(byId.get("video-1080")?.estimatedBytes, 63_000_000);
  });

  it("names vertical videos after the shorter edge", () => {
    const vertical = buildQualityOptions({
      id: "vertical0001",
      duration: 30,
      formats: [
        format({ format_id: "140", ext: "m4a", acodec: "mp4a.40.2", vcodec: "none", abr: 128 }),
        format({ format_id: "617", ext: "mp4", vcodec: "avc1", acodec: "none", width: 1080, height: 1920, fps: 30 }),
      ],
    });
    assert.equal(vertical[0]?.id, "video-1080");
  });

  it("falls back to muxed formats when no separate streams exist", () => {
    const muxedOnly = buildQualityOptions({
      id: "muxedonly01",
      duration: 60,
      formats: [
        format({
          format_id: "18",
          ext: "mp4",
          vcodec: "avc1",
          acodec: "mp4a.40.2",
          height: 360,
          width: 640,
          format_note: "360p",
        }),
      ],
    });
    assert.deepEqual(
      muxedOnly.map((option) => [option.id, option.formatSelector]),
      [["video-360", "18"]],
    );
  });

  it("does not expose internal fields publicly", () => {
    const publicOption = toPublicOption(options[0]!);
    assert.ok(!("formatSelector" in publicOption));
    assert.ok(!("parts" in publicOption));
  });
});
