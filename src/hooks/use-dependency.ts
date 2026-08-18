"use client";

import { useMemo } from "react";
import {
	check_dependency_paths,
	get_dependencies,
	get_dependency_candidates,
} from "@/lib/dependency-env";
import { createAsyncResource, createKeyedResource } from "@/lib/store/create-async-resource";
import { shallowEqual, useStore } from "@/lib/store/create-store";
import type { DependencyCandidate, DependencyReport } from "@/lib/types";
import { TOOL_KEYS } from "@/registry/tools";

export type DependencyCurrentState =
	| { status: "loading" }
	| { status: "ready"; deps: DependencyReport };

export type DependencyHookResult = DependencyCurrentState & {
	recheck: () => Promise<DependencyReport | null>;
	checkPaths: () => Promise<DependencyReport | null>;
};

// ── The dependency report ─────────────────────────────────────────────────────
// One module-level resource shared by every consumer, so the header badge, the
// tool cards and the dialogs all read the same report and a single recheck
// updates all of them.

/**
 * Which backend call the next fetch should make.
 *
 * "Check Paths" is a deliberately heavier full rescan, but it lands in the same
 * store as the ordinary report — one value, two ways of producing it. The flag
 * is consumed by whichever fetch runs next, so a rescan requested while a
 * refresh is already in flight still happens rather than being dropped.
 */
let nextFetchMode: "auto" | "rescan" = "auto";

const report = createAsyncResource<DependencyReport>({
	key: "dependencies",
	// Explicitly dropped on every mutation, so a long TTL means a mount or a
	// dialog open reuses the resolved value instead of re-probing the disk.
	ttl: Number.MAX_SAFE_INTEGER,
	fetcher: async () => {
		const rescan = nextFetchMode === "rescan";
		nextFetchMode = "auto";
		try {
			const result = rescan ? await check_dependency_paths() : await get_dependencies();
			// Re-probe candidates in the background so the path picker opens from
			// memory rather than waiting on a probe.
			prefetchCandidates();
			return result;
		} catch (error) {
			console.error(
				rescan ? "Failed to check dependency paths" : "Failed to fetch dependencies",
				error
			);
			throw error;
		}
	},
});

// ── Per-tool installation candidates ──────────────────────────────────────────
// Keyed by canonical tool name. Populated in the background after every
// successful report fetch; dropped wholesale whenever a path could have moved.

const candidates = createKeyedResource<DependencyCandidate[]>(
	"dependency-candidates",
	(toolKey) => get_dependency_candidates(toolKey, false),
	{ ttl: Number.MAX_SAFE_INTEGER }
);

function prefetchCandidates(): void {
	for (const toolKey of TOOL_KEYS) {
		void candidates.forKey(toolKey).read();
	}
}

/**
 * Drops every cached candidate list.
 *
 * Call after install / uninstall / `set_dependency_override` — anything that
 * can move a binary. The next path-picker open re-probes from scratch.
 */
export function dropCandidateCache(): void {
	candidates.clear();
}

/**
 * Candidates for one tool, from cache when available.
 *
 * Rejects rather than resolving empty when the probe fails, so the path picker
 * can distinguish "nothing installed" from "we could not look".
 */
export async function getCachedCandidates(toolKey: string): Promise<DependencyCandidate[]> {
	const resource = candidates.forKey(toolKey);
	const value = await resource.read();
	if (value !== undefined) return value;
	const { error } = resource.store.get();
	throw error ?? new Error(`Could not detect installations for ${toolKey}`);
}

/**
 * Already-resolved candidates, if any, without awaiting.
 *
 * Lets a dialog mount populated on frame 0 instead of flashing a spinner.
 */
export function getSyncCachedCandidates(toolKey: string): DependencyCandidate[] | undefined {
	return candidates.peek(toolKey);
}

// ── Report reads and writes ───────────────────────────────────────────────────

/**
 * Re-fetches the dependency report.
 *
 * Concurrent calls collapse into one in-flight fetch plus at most one queued
 * rerun — a recheck fired immediately after an uninstall is never swallowed in
 * favour of the stale result already on the wire.
 */
export async function refreshDependencies(): Promise<DependencyReport | null> {
	await report.refresh();
	// On failure the resource keeps the last good value; returning it (rather
	// than null) matches what every caller already assumes.
	return report.peek() ?? null;
}

/** Full re-scan of every dependency path on the system. */
export async function checkDependencyPaths(): Promise<DependencyReport | null> {
	dropCandidateCache();
	nextFetchMode = "rescan";
	await report.refresh();
	return report.peek() ?? null;
}

/** Synchronously-available report, for non-React callers. */
export function peekDependencies(): DependencyReport | undefined {
	return report.peek();
}

// Initial app-startup check. Skipped during the static export prerender, where
// there is no Tauri host to answer.
if (typeof window !== "undefined") {
	void report.read();
}

function selectDependencyState(state: {
	data: DependencyReport | undefined;
}): DependencyCurrentState {
	return state.data ? { status: "ready", deps: state.data } : { status: "loading" };
}

export default function useDependency(): DependencyHookResult {
	const state = useStore(report.store, selectDependencyState, shallowEqual);

	// Stable identity: a new object only when the report itself changes.
	// `recheck` and `checkPaths` are module-level, so they never invalidate it.
	return useMemo<DependencyHookResult>(
		() => ({ ...state, recheck: refreshDependencies, checkPaths: checkDependencyPaths }),
		[state]
	);
}
