import type { LucideIcon } from "lucide-react";
import ffmpegIcon from "@/assets/ffmpeg-icon.svg";
import ytdlpIcon from "@/assets/ytdlp-icon.svg";

/**
 * The frontend tool registry.
 *
 * One literal per managed binary. Adding a fourth tool is a single entry here
 * plus the matching `ToolSpec` row on the Rust side — no component, hook, or
 * page edit. This mirrors the backend registry planned for `core/tools/`.
 */

/** Shape produced by importing an `.svg` (see `src/types/svg.d.ts`). */
export type ToolLogo = {
	src: string;
	width: number;
	height: number;
};

export type ToolSpec = {
	/** Canonical key, matching `DependencyReport`'s field name. */
	key: string;
	/**
	 * Every spelling this tool answers to. Install state and the dependency map
	 * are keyed by all of them, so `depMap["yt-dlp"]` and `depMap["ytdlp"]`
	 * resolve to the same entry.
	 */
	aliases: string[];
	/** The spelling the Rust install/uninstall commands expect. */
	installName: string;
	/** Display name. Prefer `formatToolName()` when all you have is a raw key. */
	name: string;
	description: string;
	features: string[];
	license: string;
	publisher: string;
	websiteUrl: string;
	/** Bitmap/vector logo. Takes precedence over `icon` when both are set. */
	logo?: ToolLogo;
	/** Fallback glyph for tools with no artwork of their own. */
	icon?: LucideIcon;
};

export const TOOLS: readonly ToolSpec[] = [
	{
		key: "ffmpeg",
		aliases: ["ffmpeg"],
		installName: "ffmpeg",
		name: "FFmpeg",
		description:
			"Core multimedia framework used for video transcoding, container muxing, and video editing.",
		features: ["Video Transcoding", "MP4/MKV Muxing", "Audio Extraction", "Trimming"],
		license: "LGPL v2.1+ / GPL v2+",
		publisher: "FFmpeg Project & Developers",
		websiteUrl: "https://ffmpeg.org",
		logo: ffmpegIcon,
	},
	{
		key: "ffprobe",
		aliases: ["ffprobe"],
		installName: "ffprobe",
		name: "FFprobe",
		description:
			"Media stream analyzer used for detecting audio/video codecs, frame rate, resolution, and bitrates.",
		features: ["Format Inspector", "Codec Detection", "Stream Bitrates", "Metadata"],
		license: "LGPL v2.1+ / GPL v2+",
		publisher: "FFmpeg Project & Developers",
		websiteUrl: "https://ffmpeg.org",
		logo: ffmpegIcon,
	},
	{
		key: "ytdlp",
		aliases: ["ytdlp", "yt-dlp"],
		installName: "yt-dlp",
		name: "yt-dlp",
		description:
			"Advanced media downloader CLI used for extracting videos, audio, playlists, and metadata from YouTube.",
		features: ["YouTube 4K & Audio", "Playlists & Channels", "Subtitles", "Metadata"],
		license: "Unlicense (Public Domain)",
		publisher: "yt-dlp Contributors",
		websiteUrl: "https://github.com/yt-dlp/yt-dlp",
		logo: ytdlpIcon,
	},
];

/** Canonical keys, in registry order. */
export const TOOL_KEYS: readonly string[] = TOOLS.map((tool) => tool.key);

/**
 * Order used when listing tools inside install/update dialogs. yt-dlp leads
 * because it is the one users install first and recognise by name; the FFmpeg
 * pair follows as a unit.
 */
export const INSTALL_ORDER: readonly string[] = ["ytdlp", "ffmpeg", "ffprobe"];

const byAlias = new Map<string, ToolSpec>();
for (const tool of TOOLS) {
	for (const alias of tool.aliases) byAlias.set(alias, tool);
}

/** Resolve a spec from any alias. Case-insensitive. */
export function getTool(key: string): ToolSpec | undefined {
	return byAlias.get(key) ?? byAlias.get(key.toLowerCase());
}

/**
 * Every spelling a tool answers to, for writing the same value under each key.
 * Falls back to `[key]` for a name the registry does not know, so callers never
 * have to special-case an unknown tool.
 */
export function aliasesOf(key: string): readonly string[] {
	return getTool(key)?.aliases ?? [key];
}
