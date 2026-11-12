import { useState } from "react";
import type { VideoSummary as VideoSummaryData } from "../api/types";
import { useI18n } from "../i18n/I18nProvider";
import { formatDuration } from "../utils/format";
import { Icon } from "./Icon";
import styles from "./VideoSummary.module.css";

interface VideoSummaryProps {
  video: VideoSummaryData;
}

export function VideoSummary({ video }: VideoSummaryProps) {
  const { messages, locale } = useI18n();
  const [thumbnailFailed, setThumbnailFailed] = useState(false);

  return (
    <div className={styles.summary}>
      <div className={styles.thumbnail}>
        {thumbnailFailed ? (
          <Icon name="film" size={28} />
        ) : (
          <img
            src={video.thumbnailUrl}
            alt=""
            width={480}
            height={360}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setThumbnailFailed(true)}
          />
        )}
        {video.durationSeconds !== null && (
          <span className={styles.duration} aria-label={messages.video.duration}>
            {formatDuration(video.durationSeconds, locale)}
          </span>
        )}
      </div>

      <div className={styles.details}>
        <h2 className={styles.title} dir="auto" title={video.title}>
          {video.title}
        </h2>
        {video.channel && (
          <p className={styles.channel} dir="auto">
            {video.channel}
          </p>
        )}
      </div>
    </div>
  );
}
