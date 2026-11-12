import { spawn, type ChildProcessByStdio } from "node:child_process";
import path from "node:path";
import type { Readable } from "node:stream";
import { ApiError, type ErrorCode } from "../http/apiError.js";

export interface YtDlpOptions {
  executablePath: string;
  cacheDirectory: string;
  cookiesFile: string | null;
  proxy: string | null;
  ffmpegLocation: string | null;
  extraArguments: string[];
}

export type YtDlpProcess = ChildProcessByStdio<null, Readable, Readable>;

interface RunOptions {
  timeoutMilliseconds: number;
  failureCode: ErrorCode;
}

const stderrTailLimit = 16 * 1024;

const failurePatterns: Array<[RegExp, ErrorCode]> = [
  [/sign in to confirm you(?:'|’)?re not a bot|confirm you are not a bot/i, "SOURCE_BLOCKED"],
  [/HTTP Error 429|Too Many Requests/i, "SOURCE_BLOCKED"],
  [/private video/i, "PRIVATE_VIDEO"],
  [/members[- ]only|join this channel/i, "MEMBERS_ONLY"],
  [/confirm your age|age[- ]restricted|inappropriate for some users/i, "AGE_RESTRICTED"],
  [/not available in your country|blocked it in your country|geo[- ]?restrict/i, "REGION_BLOCKED"],
  [/live event will begin|premieres in|is_upcoming|this live event/i, "LIVE_NOT_SUPPORTED"],
  [
    /video unavailable|this video is not available|has been removed|does not exist|no longer available/i,
    "VIDEO_UNAVAILABLE",
  ],
  [/requested format is not available/i, "OPTION_NOT_AVAILABLE"],
];

export function classifyFailure(stderr: string, fallback: ErrorCode): ApiError {
  const errorLines = stderr
    .split("\n")
    .filter((line) => line.startsWith("ERROR:"))
    .join("\n");
  const haystack = errorLines || stderr;

  for (const [pattern, code] of failurePatterns) {
    if (pattern.test(haystack)) {
      return new ApiError(code);
    }
  }
  return new ApiError(fallback);
}

export function lastErrorLine(stderr: string): string | null {
  const lines = stderr.split("\n").filter((line) => line.startsWith("ERROR:"));
  return lines.at(-1) ?? null;
}

export function killProcessGroup(child: YtDlpProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) {
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

function appendTail(current: string, chunk: string): string {
  const combined = current + chunk;
  return combined.length > stderrTailLimit ? combined.slice(-stderrTailLimit) : combined;
}

export class YtDlp {
  private readonly options: YtDlpOptions;

  constructor(options: YtDlpOptions) {
    this.options = options;
  }

  baseArguments(): string[] {
    const { cacheDirectory, cookiesFile, proxy, ffmpegLocation, extraArguments } = this.options;
    return [
      "--ignore-config",
      "--no-playlist",
      "--color",
      "never",
      "--socket-timeout",
      "30",
      "--retries",
      "3",
      "--fragment-retries",
      "3",
      "--cache-dir",
      cacheDirectory,
      // Deno stays the preferred runtime when installed; Node is added as a fallback.
      "--js-runtimes",
      `node:${process.execPath}`,
      ...(cookiesFile ? ["--cookies", cookiesFile] : []),
      ...(proxy ? ["--proxy", proxy] : []),
      ...(ffmpegLocation ? ["--ffmpeg-location", ffmpegLocation] : []),
      ...extraArguments,
    ];
  }

  spawn(argumentsList: string[]): YtDlpProcess {
    return spawn(this.options.executablePath, [...this.baseArguments(), ...argumentsList], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
      // Own process group, so ffmpeg and JS runtime children can be signalled together.
      detached: true,
    });
  }

  /** Runs yt-dlp to completion and returns stdout, or throws a classified ApiError. */
  run(argumentsList: string[], options: RunOptions): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = this.spawn(argumentsList);
      const stdoutChunks: Buffer[] = [];
      let stderrTail = "";
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        killProcessGroup(child, "SIGKILL");
      }, options.timeoutMilliseconds);

      child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => {
        stderrTail = appendTail(stderrTail, chunk.toString("utf8"));
      });

      child.on("error", (error: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        reject(
          error.code === "ENOENT"
            ? new ApiError("INTERNAL_ERROR", `yt-dlp was not found at "${this.options.executablePath}".`)
            : error,
        );
      });

      child.on("close", (exitCode) => {
        clearTimeout(timer);
        if (timedOut) {
          reject(new ApiError(options.failureCode, "yt-dlp did not respond in time."));
          return;
        }
        if (exitCode !== 0) {
          const failure = classifyFailure(stderrTail, options.failureCode);
          reject(Object.assign(failure, { cause: lastErrorLine(stderrTail) }));
          return;
        }
        resolve(Buffer.concat(stdoutChunks).toString("utf8"));
      });
    });
  }

  async version(): Promise<string | null> {
    try {
      const output = await this.runRaw(["--version"], 15_000);
      return output.trim() || null;
    } catch {
      return null;
    }
  }

  async update(): Promise<string> {
    return (await this.runRaw(["--update"], 120_000)).trim();
  }

  private runRaw(argumentsList: string[], timeoutMilliseconds: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.options.executablePath, argumentsList, { stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMilliseconds);
      child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString("utf8")));
      child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString("utf8")));
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (exitCode) => {
        clearTimeout(timer);
        if (exitCode === 0) {
          resolve(output);
        } else {
          reject(new Error(output.trim() || `yt-dlp exited with code ${exitCode}`));
        }
      });
    });
  }
}

export async function isFfmpegAvailable(ffmpegLocation: string | null): Promise<boolean> {
  const executable = ffmpegLocation
    ? ffmpegLocation.endsWith("ffmpeg")
      ? ffmpegLocation
      : path.join(ffmpegLocation, "ffmpeg")
    : "ffmpeg";

  return new Promise((resolve) => {
    const child = spawn(executable, ["-version"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (exitCode) => resolve(exitCode === 0));
  });
}
