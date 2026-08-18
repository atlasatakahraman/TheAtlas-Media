import type { DependencyReport } from "@/lib/types";
import type { DependencyBadgeDetails } from "./types";

export const NO_BADGE: DependencyBadgeDetails = {
	show: false,
	label: "",
	shortLabel: "",
	actionLabel: "Update",
	isMissing: false,
	tools: [],
};

/**
 * Evaluates dependencies in strict priority order:
 *
 *   1. Anything missing (`status === "notInstalled"`) wins — you cannot update
 *      your way out of a tool that isn't there.
 *   2. Otherwise, managed installs with an update available.
 *
 * FFprobe is folded into FFmpeg when both are missing: they ship together, so
 * reporting them separately would tell the user to install one thing twice.
 */
export function getDependencyBadgeDetails(deps: DependencyReport): DependencyBadgeDetails {
	const missing: string[] = [];
	if (deps.ytdlp.status === "notInstalled") missing.push("yt-dlp");
	if (deps.ffmpeg.status === "notInstalled") missing.push("FFmpeg");
	if (deps.ffprobe.status === "notInstalled" && !missing.includes("FFmpeg")) {
		missing.push("FFprobe");
	}

	if (missing.length > 0) {
		return {
			show: true,
			label:
				missing.length === 1
					? `Missing ${missing[0]}`
					: `Install Missing Dependencies (${missing.join(", ")})`,
			shortLabel: "Missing Dependencies",
			actionLabel: "Install",
			isMissing: true,
			tools: missing,
		};
	}

	const updates: string[] = [];
	if (hasManagedUpdate(deps, "ytdlp")) updates.push("yt-dlp");
	if (hasManagedUpdate(deps, "ffmpeg")) updates.push("FFmpeg");
	if (hasManagedUpdate(deps, "ffprobe")) updates.push("FFprobe");

	if (updates.length > 0) {
		return {
			show: true,
			label: updates.length === 1 ? `${updates[0]} Update Available` : "Updates Available",
			shortLabel: updates.length === 1 ? "Update Available" : "Updates Available",
			actionLabel: "Update",
			isMissing: false,
			tools: updates,
		};
	}

	return NO_BADGE;
}

function hasManagedUpdate(
	deps: DependencyReport,
	key: "ytdlp" | "ffmpeg" | "ffprobe"
): boolean {
	const info = deps[key];
	return (
		info.status === "installed" && info.source === "managed" && !!info.updateAvailable
	);
}

export function getToolSpecificDescription(isMissing: boolean): string {
	return isMissing
		? "Some tools are not gonna accessible until it is installed."
		: "A new update is available. Click to update to the latest release.";
}
