import type { ErrorCode, ProcessingStep } from "../api/types";
import { appName } from "../config";

export type Language = "en" | "fa";

export interface Messages {
  documentTitle: string;
  header: {
    languageLabel: string;
  };
  hero: {
    title: string;
    subtitle: string;
  };
  urlForm: {
    label: string;
    placeholder: string;
    paste: string;
    submit: string;
    submitting: string;
    hint: string;
    emptyError: string;
  };
  video: {
    duration: string;
  };
  quality: {
    legend: string;
    videoGroup: string;
    audioGroup: string;
    m4aDescription: string;
    mp3Description: string;
    unknownSize: string;
    approximately: (size: string) => string;
  };
  download: {
    submit: string;
    cancel: string;
    retry: string;
    queued: (position: string) => string;
    preparing: string;
    downloading: string;
    steps: Record<ProcessingStep, string>;
    progressOf: (downloaded: string, total: string) => string;
    timeLeft: (time: string) => string;
    completedTitle: string;
    completedDescription: string;
    saveFile: string;
    startOver: string;
    cancelled: string;
  };
  howItWorks: {
    title: string;
    steps: Array<{ title: string; description: string }>;
  };
  errors: Record<ErrorCode | "UNKNOWN", string>;
  footer: {
    notice: string;
    disclaimer: string;
  };
}

export const english: Messages = {
  documentTitle: `${appName} — YouTube video downloader`,
  header: {
    languageLabel: "Language",
  },
  hero: {
    title: "Download YouTube videos",
    subtitle: "Paste a video link, choose the quality you need and save the file to your device.",
  },
  urlForm: {
    label: "Video link",
    placeholder: "https://www.youtube.com/watch?v=…",
    paste: "Paste",
    submit: "Continue",
    submitting: "Checking…",
    hint: "Works with regular videos, Shorts and youtu.be links.",
    emptyError: "Enter a YouTube video link.",
  },
  video: {
    duration: "Duration",
  },
  quality: {
    legend: "Choose a format",
    videoGroup: "Video",
    audioGroup: "Audio only",
    m4aDescription: "Original quality",
    mp3Description: "Plays on any device",
    unknownSize: "Size unknown",
    approximately: (size) => `~${size}`,
  },
  download: {
    submit: "Download",
    cancel: "Cancel",
    retry: "Try again",
    queued: (position) => `Waiting in queue, position ${position}`,
    preparing: "Preparing download…",
    downloading: "Downloading…",
    steps: {
      merging: "Merging video and audio…",
      converting: "Converting to MP3…",
      finalizing: "Finalizing file…",
    },
    progressOf: (downloaded, total) => `${downloaded} of ${total}`,
    timeLeft: (time) => `${time} left`,
    completedTitle: "Your file is ready",
    completedDescription: "The download should start automatically. If it doesn't, use the button below.",
    saveFile: "Save file",
    startOver: "Download another video",
    cancelled: "The download was cancelled.",
  },
  howItWorks: {
    title: "How it works",
    steps: [
      {
        title: "Paste the link",
        description: "Copy the address of any public YouTube video and paste it into the field above.",
      },
      {
        title: "Pick a format",
        description: "Choose a video resolution or keep only the audio track as M4A or MP3.",
      },
      {
        title: "Save the file",
        description: "The file is prepared on the server and downloaded straight to your device.",
      },
    ],
  },
  errors: {
    INVALID_URL: "This doesn't look like a YouTube video link. Check the address and try again.",
    PLAYLIST_NOT_SUPPORTED: "Playlists aren't supported. Open a single video and copy its link.",
    VIDEO_UNAVAILABLE: "This video is unavailable. It may have been removed or made private.",
    PRIVATE_VIDEO: "This video is private and can't be downloaded.",
    MEMBERS_ONLY: "This video is available to channel members only.",
    AGE_RESTRICTED: "This video is age-restricted and can't be downloaded.",
    REGION_BLOCKED: "This video isn't available in the server's region.",
    LIVE_NOT_SUPPORTED: "Live streams and upcoming premieres can't be downloaded.",
    VIDEO_TOO_LONG: "This video is longer than the maximum length allowed on this service.",
    SOURCE_BLOCKED: "YouTube is temporarily limiting requests from this server. Please try again later.",
    OPTION_NOT_AVAILABLE: "The selected format is no longer available. Load the video again and pick another format.",
    RATE_LIMITED: "Too many requests. Please wait a moment and try again.",
    SERVER_BUSY: "The server is busy right now. Please try again in a few minutes.",
    JOB_NOT_FOUND: "This download has expired. Please start again.",
    FILE_NOT_READY: "The file isn't ready yet. Please wait a moment.",
    FILE_EXPIRED: "This file is no longer available. Please start the download again.",
    INSPECTION_FAILED: "We couldn't read this video. Please try again.",
    DOWNLOAD_FAILED: "The download failed. Please try again.",
    VALIDATION_FAILED: "The request was invalid. Check the link and try again.",
    NOT_FOUND: "The requested resource wasn't found.",
    INTERNAL_ERROR: "Something went wrong on our side. Please try again.",
    NETWORK_ERROR: "Can't reach the server. Check your connection and try again.",
    UNKNOWN: "Something went wrong. Please try again.",
  },
  footer: {
    notice: "Download only content you own or have permission to save.",
    disclaimer: `${appName} is not affiliated with YouTube or Google.`,
  },
};
