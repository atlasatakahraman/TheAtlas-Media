export type DependencyPathDialogProps = {
	/** Tool key ("ffmpeg" | "ffprobe" | "ytdlp") to pick a path for, or null when closed. */
	toolKey: string | null;
	/** The currently active resolved path (`DependencyInfo.path`), to mark the active candidate. */
	currentPath: string | null;
	onClose: () => void;
	/** Called after a successful change (including reset-to-automatic) so the caller can recheck. */
	onChanged: () => void;
	/**
	 * Opens the batch dialog instead. Optional so the picker stays usable on
	 * its own; when given, a "Change all" shortcut appears.
	 */
	onOpenBatch?: () => void;
};

/** Sentinel `pendingPath` value for the "Reset to Automatic" action. */
export const AUTO_PATH = "__auto__";
