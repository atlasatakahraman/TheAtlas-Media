"use client";

/**
 * Format a dependency tool key into its display name.
 * Shared across Header, dependency-dialogs, and dependencies page.
 */
export function formatToolName(name: string): string {
	const lower = name.toLowerCase();
	if (lower === "ffmpeg") return "FFmpeg";
	if (lower === "ffprobe") return "FFprobe";
	if (lower === "yt-dlp" || lower === "ytdlp") return "yt-dlp";
	return name;
}

/**
 * Get a human-readable description of what features are disabled
 * when a given tool is uninstalled.
 */
export function getToolDisabledImpact(name: string): string {
	const lower = name.toLowerCase();
	if (lower === "ffmpeg") return "Video transcoding, format conversion (MP4/MKV), and video trimming will be disabled until reinstalled.";
	if (lower === "ffprobe") return "Media stream analysis, video codec detection, and metadata inspector will be disabled until reinstalled.";
	if (lower === "yt-dlp" || lower === "ytdlp") return "YouTube video downloads, channel archiving, and playlist extractions will be disabled until reinstalled.";
	return "Related media processing features will be disabled until reinstalled.";
}
