/** Subset of the JSON document produced by `yt-dlp --dump-single-json`. */
export interface YtDlpFormat {
  format_id: string;
  format_note?: string | null;
  ext?: string | null;
  protocol?: string | null;
  vcodec?: string | null;
  acodec?: string | null;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  tbr?: number | null;
  abr?: number | null;
  filesize?: number | null;
  filesize_approx?: number | null;
  dynamic_range?: string | null;
  language?: string | null;
  language_preference?: number | null;
  has_drm?: boolean | null;
}

export interface YtDlpVideoInfo {
  id: string;
  title?: string | null;
  fulltitle?: string | null;
  channel?: string | null;
  uploader?: string | null;
  duration?: number | null;
  live_status?: string | null;
  is_live?: boolean | null;
  formats?: YtDlpFormat[] | null;
}
