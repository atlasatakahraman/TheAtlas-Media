import type { ToolChecksumInfo } from "@/components/dependencies/dialogs/up-to-date/types";
import type { ToolInstallInfo } from "@/hooks/use-install";
import type { DependencyInfo, DependencyReport } from "@/lib/types";
import { getTool, INSTALL_ORDER, TOOLS, type ToolSpec } from "@/registry/tools";
import type { DepMap, ToolInfoMode, UpdateCheckResult } from "./types";

/**
 * A report's per-tool entries, addressed by canonical key.
 *
 * `DependencyReport`'s field names *are* the canonical keys, which is what lets
 * the whole page stay registry-driven instead of naming each tool in turn.
 */
function entryOf(report: DependencyReport, key: string): DependencyInfo | undefined {
	return (report as unknown as Record<string, DependencyInfo | undefined>)[key];
}

/**
 * Indexes the report under every alias, so a lookup by either spelling
 * ("ytdlp" or "yt-dlp") resolves to the same entry.
 */
export function buildDepMap(report: DependencyReport | undefined): DepMap {
	const map: DepMap = {};
	if (!report) return map;
	for (const tool of TOOLS) {
		const info = entryOf(report, tool.key);
		for (const alias of tool.aliases) map[alias] = info;
	}
	return map;
}

/**
 * The tool list for an install/update dialog.
 *
 * Three call sites wanted almost the same list and had each grown their own
 * copy of this loop:
 *   - "missing"      — only tools the backend cannot find at all.
 *   - "unmanaged"    — tools with no managed copy, however they currently resolve.
 *   - "all-managed"  — every tool, for a full reinstall.
 *
 * "missing" reports the resolved version because that is the one the user can
 * see; the other two report the *managed* version, since a managed install is
 * what they are about to change.
 */
export function buildToolInstallInfos(
	report: DependencyReport | undefined,
	mode: ToolInfoMode
): ToolInstallInfo[] {
	if (!report) return [];

	const items: ToolInstallInfo[] = [];
	for (const key of INSTALL_ORDER) {
		const spec = getTool(key);
		const info = entryOf(report, key);
		if (!spec || !info) continue;

		if (mode === "missing" && info.status !== "notInstalled") continue;
		if (mode === "unmanaged" && info.managedInstalled) continue;

		items.push({
			name: spec.installName,
			currentVersion:
				mode === "missing"
					? (info.version ?? "Not Installed")
					: (info.managedVersion ?? info.version ?? "Not Installed"),
			targetVersion: info.latestVersion ?? "Latest Release",
		});
	}
	return items;
}

/** True when every tool has a managed copy on disk. */
export function allManagedInstalled(report: DependencyReport | undefined): boolean {
	if (!report) return false;
	return TOOLS.every((tool) => entryOf(report, tool.key)?.managedInstalled);
}

/**
 * Cards, most-actionable first.
 *
 * A shadowed managed copy leads: it is the only state where the app has two
 * working binaries and is silently using the one it does not control.
 */
export function sortToolsByPriority(depMap: DepMap): ToolSpec[] {
	function priority(key: string): number {
		const info = depMap[key];
		if (!info) return 1;
		if (info.managedPath && info.path && info.managedPath !== info.path) return 0;
		if (info.status === "notInstalled") return 1;
		if (info.updateAvailable) return 2;
		if (info.source === "managed") return 3;
		return 4;
	}
	return [...TOOLS].sort((a, b) => priority(a.key) - priority(b.key));
}

/**
 * Splits a freshly-checked report into "has an update" and "verified as-is".
 *
 * Two different questions, deliberately answered in one pass:
 *   - Checksums are collected for *every* installed tool, however it resolves,
 *     because the user asked us to verify what is on disk.
 *   - Updates are only offered for managed copies. TheAtlas does not own an
 *     env or PATH binary and must not offer to replace one.
 */
export function collectUpdateCheck(report: DependencyReport | undefined): UpdateCheckResult {
	const toolsToUpdate: ToolInstallInfo[] = [];
	const verifiedTools: ToolChecksumInfo[] = [];
	if (!report) return { toolsToUpdate, verifiedTools };

	for (const key of INSTALL_ORDER) {
		const info = entryOf(report, key);
		if (!info || info.status !== "installed") continue;

		if (info.sha256) {
			verifiedTools.push({
				name: info.name,
				version: info.version ?? "Installed",
				sha256: info.sha256,
			});
		}

		if (info.source === "managed" && info.updateAvailable) {
			toolsToUpdate.push({
				name: info.name,
				currentVersion: info.version ?? "Installed",
				targetVersion: info.latestVersion ?? "Latest Release",
			});
		}
	}

	return { toolsToUpdate, verifiedTools };
}
