declare namespace Cloudflare {
  interface Env {
    DOWNLOADER: DurableObjectNamespace<import("./index").DownloaderContainer>;

    LOG_LEVEL?: string;
    MAX_CONCURRENT_DOWNLOADS?: string;
    MAX_QUEUED_DOWNLOADS?: string;
    MAX_ACTIVE_DOWNLOADS_PER_CLIENT?: string;
    MAX_VIDEO_DURATION_MINUTES?: string;
    FILE_RETENTION_MINUTES?: string;
    INSPECT_REQUESTS_PER_HOUR?: string;
    DOWNLOAD_REQUESTS_PER_HOUR?: string;
    YTDLP_AUTO_UPDATE?: string;
    YTDLP_COOKIES_BASE64?: string;
    YTDLP_PROXY?: string;
    YTDLP_EXTRA_ARGUMENTS?: string;
  }
}

interface Env extends Cloudflare.Env {}
