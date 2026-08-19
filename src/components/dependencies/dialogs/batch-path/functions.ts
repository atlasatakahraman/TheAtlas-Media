import { HardDrive, RotateCcw, Terminal } from "lucide-react";

import { formatSourceLabel, formatToolName } from "@/lib/tool-names";
import type { DependencyCandidate, DependencyReport, DependencySource } from "@/lib/types";
import { formatVersionDisplay } from "@/lib/version";
import { TOOLS } from "@/registry/tools";
import type {
	BatchSourceMode,
	CandidatesByTool,
	ImpactRow,
	StrategyOption,
} from "./types";

/**
 * Everything the batch dialog decides, as pure functions over the report and
 * the probed candidates.
 *
 * Driven by `TOOLS` rather than a hardcoded `["yt-dlp", "ffmpeg", "ffprobe"]`
 * list, which is the version this replaces. A fourth managed tool now appears
 * in the strategy counts and the preview with no edit here.
 */

/** The source each pinned mode targets. `"auto"` pins nothing. */
const MODE_SOURCE: Record<Exclude<BatchSourceMode, "auto">, DependencySource> = {
	managed: "managed",
	path: "path",
};

/** Canonical keys, in registry order. */
export function toolKeys(): string[] {
	return TOOLS.map((tool) => tool.key);
}

/** The spelling the backend commands expect for a tool key. */
export function installNameFor(key: string): string {
	return TOOLS.find((tool) => tool.key === key)?.installName ?? key;
}

/** Read a tool's entry out of the report by its registry key. */
export function infoFor(report: DependencyReport | null, key: string) {
	if (!report) return undefined;
	return (report as unknown as Record<string, DependencyReport["ffmpeg"] | undefined>)[key];
}

/**
 * Which mode the app is in right now.
 *
 * Only reports a pinned mode when *every* tool agrees; a mixed set is "auto",
 * because no single strategy describes it and claiming one would mislabel the
 * button the user is about to press.
 */
export function currentMode(report: DependencyReport | null): BatchSourceMode {
	if (!report) return "auto";

	const sources = toolKeys().map((key) => infoFor(report, key)?.source);
	if (sources.length === 0) return "auto";

	for (const mode of ["managed", "path"] as const) {
		if (sources.every((source) => source === MODE_SOURCE[mode])) return mode;
	}
	return "auto";
}

/** The first working candidate of `source` for a tool, if there is one. */
export function workingCandidate(
	candidates: CandidatesByTool,
	key: string,
	source: DependencySource,
): DependencyCandidate | undefined {
	return candidates[key]?.find(
		(candidate) => candidate.source === source && candidate.working,
	);
}

/** How many tools a pinned mode can actually move. */
export function availableCount(
	candidates: CandidatesByTool,
	mode: Exclude<BatchSourceMode, "auto">,
): number {
	return toolKeys().filter((key) => workingCandidate(candidates, key, MODE_SOURCE[mode]))
		.length;
}

/**
 * The overrides payload for a mode.
 *
 * Every tool appears, so switching to a mode also *clears* a stale override on
 * a tool that has no candidate for it — otherwise "switch everything to
 * managed" would silently leave one tool pinned to a PATH binary.
 */
export function overridesFor(
	candidates: CandidatesByTool,
	mode: BatchSourceMode,
): Record<string, string | null> {
	const overrides: Record<string, string | null> = {};

	for (const key of toolKeys()) {
		const name = installNameFor(key);
		if (mode === "auto") {
			overrides[name] = null;
			continue;
		}
		overrides[name] = workingCandidate(candidates, key, MODE_SOURCE[mode])?.path ?? null;
	}

	return overrides;
}

/** The three selectable strategies, with live counts. */
export function strategies(
	candidates: CandidatesByTool,
	report: DependencyReport | null,
): StrategyOption[] {
	const active = currentMode(report);
	const total = toolKeys().length;
	const managed = availableCount(candidates, "managed");
	const system = availableCount(candidates, "path");

	return [
		{
			id: "auto",
			title: "Automatic Precedence",
			description:
				"Restore the default resolution order: environment variables, then managed storage, then system PATH.",
			icon: RotateCcw,
			badge: active === "auto" ? "Current" : "Default",
			// Always offered: clearing overrides needs no candidate to exist.
			available: true,
			isCurrent: active === "auto",
		},
		{
			id: "managed",
			title: "Managed Binaries",
			description:
				"Pin every tool to the copy TheAtlas installed and can keep updated.",
			icon: HardDrive,
			badge:
				active === "managed"
					? `Current (${managed}/${total})`
					: `${managed}/${total} available`,
			available: managed > 0,
			isCurrent: active === "managed",
		},
		{
			id: "path",
			title: "System Installations",
			description: "Pin every tool to the copy already installed on your system PATH.",
			icon: Terminal,
			badge:
				active === "path"
					? `Current (${system}/${total})`
					: `${system}/${total} detected`,
			available: system > 0,
			isCurrent: active === "path",
		},
	];
}

/** One before → after row per tool, for the preview. */
export function impactRows(
	candidates: CandidatesByTool,
	report: DependencyReport | null,
	mode: BatchSourceMode,
): ImpactRow[] {
	const overrides = overridesFor(candidates, mode);

	return toolKeys().map((key) => {
		const info = infoFor(report, key);
		const targetPath = overrides[installNameFor(key)];
		const target = targetPath
			? candidates[key]?.find((candidate) => candidate.path === targetPath)
			: undefined;

		return {
			toolKey: key,
			name: formatToolName(key),
			fromLabel: describe(
				info?.source ? formatSourceLabel(info.source) : "Automatic",
				info?.version ?? null,
			),
			toLabel:
				mode === "auto"
					? "Automatic resolution"
					: target
						? describe(formatSourceLabel(target.source), target.version)
						: "Unchanged — none found",
			missing: mode !== "auto" && !target,
			targetSource: target?.source ?? null,
		};
	});
}

function describe(label: string, version: string | null): string {
	return version ? `${label} (${formatVersionDisplay(version)})` : label;
}
