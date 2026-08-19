import type { VideoFormat } from "@/lib/types";

/** e.g. "1080p60 · H.264 · 45.2 MB". Omits fields yt-dlp did not report
 *  rather than printing "null". */
export function formatLabel(format: VideoFormat): string {
	const parts: string[] = [];

	if (format.resolution) {
		parts.push(format.fps ? `${format.resolution}@${Math.round(format.fps)}` : format.resolution);
	}
	if (format.vcodec && format.vcodec !== "none") parts.push(format.vcodec);
	if (format.acodec && format.acodec !== "none") parts.push(format.acodec);
	if (format.filesizeBytes) {
		parts.push(`${(format.filesizeBytes / 1_048_576).toFixed(1)} MB`);
	}

	return parts.length > 0 ? parts.join(" · ") : format.formatId;
}
