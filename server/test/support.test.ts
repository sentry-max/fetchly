import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectProcessingStep, parseProgressLine, progressTemplate } from "../src/downloads/progressParser.js";
import { buildContentDisposition, buildDownloadFileName, sanitizeFileName } from "../src/http/fileNames.js";
import { RateLimiter } from "../src/http/rateLimiter.js";
import { classifyFailure } from "../src/process/ytDlp.js";

describe("progress parsing", () => {
  it("reads a progress line produced by the template", () => {
    const line = `${progressTemplate.replace("download:", "").split("%")[0]}downloading|1048576|4194304|NA|524288.5|6|137`;
    assert.deepEqual(parseProgressLine(line), {
      status: "downloading",
      downloadedBytes: 1_048_576,
      totalBytes: 4_194_304,
      speedBytesPerSecond: 524_288.5,
      etaSeconds: 6,
      formatId: "137",
    });
  });

  it("falls back to the estimated total", () => {
    const sample = parseProgressLine("[fetchly-progress]downloading|10|NA|200|NA|NA|NA");
    assert.equal(sample?.totalBytes, 200);
    assert.equal(sample?.speedBytesPerSecond, null);
    assert.equal(sample?.formatId, null);
  });

  it("ignores unrelated output", () => {
    assert.equal(parseProgressLine("[youtube] dQw4w9WgXcQ: Downloading webpage"), null);
  });

  it("detects post-processing steps", () => {
    assert.equal(detectProcessingStep('[Merger] Merging formats into "media.mp4"'), "merging");
    assert.equal(detectProcessingStep("[ExtractAudio] Destination: media.mp3"), "converting");
    assert.equal(detectProcessingStep("[download] 100%"), null);
  });
});

describe("file names", () => {
  it("removes characters that are invalid on common file systems", () => {
    assert.equal(sanitizeFileName('Live: "Best" of 2026 / Part 1?'), "Live Best of 2026 Part 1");
  });

  it("keeps non-Latin titles intact", () => {
    assert.equal(buildDownloadFileName("آموزش زبان آلمانی", "1080p", "mp4"), "آموزش زبان آلمانی (1080p).mp4");
  });

  it("encodes UTF-8 names for Content-Disposition", () => {
    const header = buildContentDisposition("آموزش (720p).mp4");
    assert.match(header, /^attachment; filename="\(720p\)\.mp4"; filename\*=UTF-8''/);
    assert.ok(header.includes("%D8%A2"));
    assert.ok(header.includes("%28720p%29"));
  });
});

describe("failure classification", () => {
  it("maps known yt-dlp errors to API codes", () => {
    assert.equal(
      classifyFailure("ERROR: [youtube] abc: Private video. Sign in", "INSPECTION_FAILED").code,
      "PRIVATE_VIDEO",
    );
    assert.equal(
      classifyFailure("ERROR: [youtube] abc: Sign in to confirm you’re not a bot", "INSPECTION_FAILED").code,
      "SOURCE_BLOCKED",
    );
    assert.equal(
      classifyFailure("ERROR: [youtube] abc: Video unavailable", "INSPECTION_FAILED").code,
      "VIDEO_UNAVAILABLE",
    );
    assert.equal(classifyFailure("ERROR: something new", "DOWNLOAD_FAILED").code, "DOWNLOAD_FAILED");
  });
});

describe("RateLimiter", () => {
  it("blocks requests above the limit inside the window", () => {
    const limiter = new RateLimiter(2, 60_000);
    assert.equal(limiter.consume("client").allowed, true);
    assert.equal(limiter.consume("client").allowed, true);
    const blocked = limiter.consume("client");
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterSeconds > 0);
    assert.equal(limiter.consume("other-client").allowed, true);
  });
});
