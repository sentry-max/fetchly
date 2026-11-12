import type { DownloadJob } from "../api/types";
import { isActiveJob } from "../hooks/useDownloadJob";
import { useI18n } from "../i18n/I18nProvider";
import type { DisplayErrorCode } from "../utils/errors";
import { formatBytes, formatInteger, formatPercent, formatRemainingTime, formatSpeed } from "../utils/format";
import styles from "./DownloadPanel.module.css";
import { Icon, Spinner } from "./Icon";
import { Notice } from "./Notice";

interface DownloadPanelProps {
  job: DownloadJob | null;
  error: DisplayErrorCode | null;
  isStarting: boolean;
  canStart: boolean;
  onStart: () => void;
  onCancel: () => void;
  onStartOver: () => void;
}

export function DownloadPanel({
  job,
  error,
  isStarting,
  canStart,
  onStart,
  onCancel,
  onStartOver,
}: DownloadPanelProps) {
  const { messages, locale } = useI18n();

  if (job && isActiveJob(job)) {
    return <DownloadProgress job={job} onCancel={onCancel} />;
  }

  if (job?.status === "completed" && job.file) {
    return (
      <div className={styles.completed} role="status">
        <div className={styles.completedHeading}>
          <Icon name="checkCircle" size={20} className={styles.successIcon} />
          <h3>{messages.download.completedTitle}</h3>
        </div>
        <p className={styles.completedDescription}>{messages.download.completedDescription}</p>
        <p className={styles.fileRow}>
          <span className={styles.fileName} dir="auto" title={job.file.name}>
            {job.file.name}
          </span>
          <span className={styles.fileSize}>{formatBytes(job.file.size, locale)}</span>
        </p>
        <div className={styles.actions}>
          <a className="button button-primary" href={job.file.url} download>
            <Icon name="download" />
            <span>{messages.download.saveFile}</span>
          </a>
          <button type="button" className="button button-secondary" onClick={onStartOver}>
            {messages.download.startOver}
          </button>
        </div>
      </div>
    );
  }

  const failureCode = job?.status === "failed" ? (job.error?.code ?? "DOWNLOAD_FAILED") : error;

  return (
    <div className={styles.idle}>
      {failureCode && <Notice tone="error">{messages.errors[failureCode]}</Notice>}
      {job?.status === "cancelled" && !failureCode && <Notice tone="neutral">{messages.download.cancelled}</Notice>}

      <button
        type="button"
        className={`button button-primary ${styles.downloadButton}`}
        onClick={onStart}
        disabled={!canStart || isStarting}
      >
        {isStarting ? <Spinner /> : <Icon name={failureCode ? "refresh" : "download"} />}
        <span>{failureCode ? messages.download.retry : messages.download.submit}</span>
      </button>
    </div>
  );
}

function DownloadProgress({ job, onCancel }: { job: DownloadJob; onCancel: () => void }) {
  const { messages, locale } = useI18n();
  const { progress } = job;

  let statusText: string;
  switch (job.status) {
    case "queued":
      statusText = messages.download.queued(formatInteger(job.queuePosition ?? 1, locale));
      break;
    case "preparing":
      statusText = messages.download.preparing;
      break;
    case "processing":
      statusText = messages.download.steps[job.processingStep ?? "finalizing"];
      break;
    default:
      statusText = messages.download.downloading;
  }

  const isDeterminate = job.status === "downloading" && progress.percent !== null;
  const details: string[] = [];

  if (job.status === "downloading") {
    if (progress.downloadedBytes !== null && progress.totalBytes !== null) {
      details.push(
        messages.download.progressOf(
          formatBytes(progress.downloadedBytes, locale),
          formatBytes(progress.totalBytes, locale),
        ),
      );
    }
    if (progress.speedBytesPerSecond !== null && progress.speedBytesPerSecond > 0) {
      details.push(formatSpeed(progress.speedBytesPerSecond, locale));
    }
    if (progress.etaSeconds !== null && progress.etaSeconds > 0) {
      details.push(messages.download.timeLeft(formatRemainingTime(progress.etaSeconds, locale)));
    }
  }

  return (
    <div className={styles.progress}>
      <div className={styles.progressHeader} aria-live="polite">
        <span className={styles.status}>{statusText}</span>
        {isDeterminate && <span className={styles.percent}>{formatPercent(progress.percent ?? 0, locale)}</span>}
      </div>

      <div
        className={styles.track}
        role="progressbar"
        aria-label={statusText}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={isDeterminate ? Math.round(progress.percent ?? 0) : undefined}
      >
        <div
          className={styles.fill}
          data-indeterminate={isDeterminate ? undefined : "true"}
          style={isDeterminate ? { width: `${progress.percent}%` } : undefined}
        />
      </div>

      <div className={styles.progressFooter}>
        <span className={styles.details}>{details.join(" · ")}</span>
        <button type="button" className="button button-secondary button-small" onClick={onCancel}>
          <Icon name="close" size={16} />
          <span>{messages.download.cancel}</span>
        </button>
      </div>
    </div>
  );
}
