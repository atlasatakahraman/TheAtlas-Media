import type { DependencyInfo, DependencyReport } from "@/lib/types";

/** The three tracked dependencies, as a plain list. */
export function toolsOf(report: DependencyReport | undefined): DependencyInfo[] {
	if (!report) return [];
	return [report.ffmpeg, report.ffprobe, report.ytdlp];
}

export function countInstalled(report: DependencyReport | undefined): number {
	return toolsOf(report).filter((tool) => tool.status === "installed").length;
}

/**
 * A tool with two distinct detected paths — an env override shadowing a managed
 * copy underneath it.
 *
 * Managed storage is in play regardless of which path currently wins, so the
 * banner must not collapse its label to "Used Cache" when this is true.
 */
export function hasAnyTwoPaths(report: DependencyReport | undefined): boolean {
	return toolsOf(report).some(
		(tool) => tool.managedPath && tool.path && tool.managedPath !== tool.path
	);
}

/**
 * Where the *installed* dependencies actually live: all system/env paths, all
 * TheAtlas-managed, or a mix.
 */
export function computeStorageLabel(report: DependencyReport | undefined): string {
	const tools = toolsOf(report);
	const installed = tools.filter((tool) => tool.status === "installed");
	if (installed.length === 0) return "Managed App Storage";

	const hasManaged = installed.some((tool) => tool.source === "managed");
	const hasSystem = installed.some((tool) => tool.source !== "managed");

	if (hasManaged && hasSystem) return "Mixed App/System Storage";
	if (hasAnyTwoPaths(report)) return "System Path (Managed Present)";
	if (hasSystem) return "System Path Storage";
	return "Managed App Storage";
}
