import { Container, getContainer } from "@cloudflare/containers";
import { env } from "cloudflare:workers";

const forwardedVariables = [
  "LOG_LEVEL",
  "MAX_CONCURRENT_DOWNLOADS",
  "MAX_QUEUED_DOWNLOADS",
  "MAX_ACTIVE_DOWNLOADS_PER_CLIENT",
  "MAX_VIDEO_DURATION_MINUTES",
  "FILE_RETENTION_MINUTES",
  "INSPECT_REQUESTS_PER_HOUR",
  "DOWNLOAD_REQUESTS_PER_HOUR",
  "YTDLP_AUTO_UPDATE",
  "YTDLP_COOKIES_BASE64",
  "YTDLP_PROXY",
  "YTDLP_EXTRA_ARGUMENTS",
] as const satisfies ReadonlyArray<keyof Env>;

function containerVariables(): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const name of forwardedVariables) {
    const value = env[name];
    if (typeof value === "string" && value !== "") {
      variables[name] = value;
    }
  }
  return variables;
}

export class DownloaderContainer extends Container<Env> {
  override defaultPort = 8080;
  override sleepAfter = "15m";
  override envVars = containerVariables();
}

export default {
  async fetch(request, environment): Promise<Response> {
    // One named instance keeps download jobs and their files on the same machine.
    return getContainer(environment.DOWNLOADER, "primary").fetch(request);
  },
} satisfies ExportedHandler<Env>;
