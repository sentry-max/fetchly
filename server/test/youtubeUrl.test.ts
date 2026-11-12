import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "../src/http/apiError.js";
import { extractVideoId } from "../src/youtube/youtubeUrl.js";

const videoId = "dQw4w9WgXcQ";

describe("extractVideoId", () => {
  const supportedLinks = [
    `https://www.youtube.com/watch?v=${videoId}`,
    `https://youtube.com/watch?v=${videoId}&t=42s`,
    `https://m.youtube.com/watch?v=${videoId}`,
    `https://music.youtube.com/watch?v=${videoId}&list=RDAMVM`,
    `https://www.youtube.com/watch?list=PL123&v=${videoId}`,
    `https://youtu.be/${videoId}`,
    `https://youtu.be/${videoId}?si=abc123`,
    `https://www.youtube.com/shorts/${videoId}`,
    `https://www.youtube.com/live/${videoId}?feature=share`,
    `https://www.youtube.com/embed/${videoId}`,
    `https://www.youtube-nocookie.com/embed/${videoId}`,
    `youtube.com/watch?v=${videoId}`,
    `  https://youtu.be/${videoId}  `,
    videoId,
  ];

  for (const link of supportedLinks) {
    it(`accepts ${link.trim()}`, () => {
      assert.equal(extractVideoId(link), videoId);
    });
  }

  const rejectedLinks: Array<[string, string]> = [
    ["https://vimeo.com/123456", "INVALID_URL"],
    ["https://www.youtube.com/@channel", "INVALID_URL"],
    ["https://www.youtube.com/watch?v=short", "INVALID_URL"],
    ["https://evil.example/watch?v=dQw4w9WgXcQ", "INVALID_URL"],
    ["https://www.youtube.com.evil.example/watch?v=dQw4w9WgXcQ", "INVALID_URL"],
    ["ftp://youtube.com/watch?v=dQw4w9WgXcQ", "INVALID_URL"],
    ["not a url at all", "INVALID_URL"],
    ["https://www.youtube.com/playlist?list=PL1234567890", "PLAYLIST_NOT_SUPPORTED"],
  ];

  for (const [link, code] of rejectedLinks) {
    it(`rejects ${link} with ${code}`, () => {
      assert.throws(
        () => extractVideoId(link),
        (error: unknown) => error instanceof ApiError && error.code === code,
      );
    });
  }
});
