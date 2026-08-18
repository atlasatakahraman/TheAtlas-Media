export type DependencyBadgeDetails = {
	show: boolean;
	/** Full sentence used by the toast. */
	label: string;
	/** Short form used on the header button itself. */
	shortLabel: string;
	actionLabel: string;
	isMissing: boolean;
	/** Display names of the tools involved, e.g. ["yt-dlp", "FFmpeg"]. */
	tools: string[];
};
