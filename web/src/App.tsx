import { useEffect, useState } from "react";
import type { QualityOption } from "./api/types";
import { DownloadPanel } from "./components/DownloadPanel";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { HowItWorks } from "./components/HowItWorks";
import { Notice } from "./components/Notice";
import { QualityPicker } from "./components/QualityPicker";
import { UrlForm } from "./components/UrlForm";
import { VideoSummary } from "./components/VideoSummary";
import { isActiveJob, useDownloadJob } from "./hooks/useDownloadJob";
import { useVideoInspection } from "./hooks/useVideoInspection";
import { useI18n } from "./i18n/I18nProvider";

const preferredHeight = 1080;

/** Defaults to 1080p: the best balance of quality and file size for most people. */
function pickDefaultOption(options: QualityOption[]): string | null {
  const videos = options.filter((option) => option.kind === "video" && option.height !== null);
  const preferred =
    videos.find((option) => option.height === preferredHeight) ??
    videos.find((option) => (option.height ?? 0) < preferredHeight) ??
    videos.at(-1) ??
    options[0];
  return preferred?.id ?? null;
}

export function App() {
  const { messages } = useI18n();
  const inspection = useVideoInspection();
  const download = useDownloadJob();
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const result = inspection.state.status === "ready" ? inspection.state.result : null;
  const downloadInProgress = isActiveJob(download.job) || download.isStarting;

  useEffect(() => {
    setSelectedOptionId(result ? pickDefaultOption(result.options) : null);
  }, [result]);

  const handleInspect = (url: string) => {
    download.reset();
    void inspection.inspect(url);
  };

  const handleSelectOption = (optionId: string) => {
    setSelectedOptionId(optionId);
    if (!downloadInProgress && (download.job || download.error)) {
      download.reset();
    }
  };

  const handleStartDownload = () => {
    if (result && selectedOptionId) {
      void download.start(result.video.id, selectedOptionId);
    }
  };

  const handleStartOver = () => {
    download.reset();
    inspection.reset();
    setFormKey((key) => key + 1);
  };

  return (
    <div className="page">
      <Header />

      <main className="container main">
        <section className="hero">
          <h1>{messages.hero.title}</h1>
          <p>{messages.hero.subtitle}</p>
        </section>

        <section className="card">
          <UrlForm
            key={formKey}
            isSubmitting={inspection.state.status === "loading"}
            isLocked={downloadInProgress}
            onSubmit={handleInspect}
          />

          {inspection.state.status === "error" && (
            <Notice tone="error">{messages.errors[inspection.state.error]}</Notice>
          )}

          {result && (
            <div className="result">
              <VideoSummary video={result.video} />
              <QualityPicker
                options={result.options}
                selectedOptionId={selectedOptionId}
                disabled={downloadInProgress}
                onSelect={handleSelectOption}
              />
              <DownloadPanel
                job={download.job}
                error={download.error}
                isStarting={download.isStarting}
                canStart={selectedOptionId !== null}
                onStart={handleStartDownload}
                onCancel={() => void download.cancel()}
                onStartOver={handleStartOver}
              />
            </div>
          )}
        </section>

        <HowItWorks />
      </main>

      <Footer />
    </div>
  );
}
