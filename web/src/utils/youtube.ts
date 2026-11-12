const youtubeLinkPattern =
  /^(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?|shorts\/|live\/|embed\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)\S+$/i;

/** Lightweight client-side check used to start inspection right after pasting. The server validates properly. */
export function looksLikeYoutubeLink(value: string): boolean {
  return youtubeLinkPattern.test(value.trim());
}
