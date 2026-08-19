/** Static config for /convert/quick. Anything a human would tweak lives here. */

export const PAGE_TITLE = "Quick Convert";

export const PAGE_DESCRIPTION = "Transcode a local file to a different container and codec.";

export const CONTAINER_OPTIONS = ["mp4", "mkv", "webm"] as const;

/** "copy" keeps the source codec untouched — no re-encode. */
export const VIDEO_CODEC_OPTIONS = ["copy", "h264", "hevc", "vp9", "av1"] as const;

export const AUDIO_CODEC_OPTIONS = ["copy", "aac", "opus"] as const;
