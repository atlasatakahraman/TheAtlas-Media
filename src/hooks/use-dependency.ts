"use client";

import { get_dependencies, get_dependency_candidates } from "@/lib/dependency-env";
import { DependencyCandidate, DependencyReport } from "@/lib/types";
import { useCallback, useEffect, useMemo, useState } from "react";

export type DependencyCurrentState =
	| { status: "loading" }
	| { status: "ready"; deps: DependencyReport };

// Module-level global cache to avoid redundant IPC checks on component mounts/refreshes.
let cachedReport: DependencyReport | null = null;
let inflight: Promise<DependencyReport | null> | null = null;
let queued: Promise<DependencyReport | null> | null = null;
const listeners = new Set<() => void>();

// ── Module-level candidate cache ──────────────────────────────────────────────
// Keyed by canonical tool name ("ffmpeg" | "ffprobe" | "ytdlp").
// Populated in the background after every refreshDependencies() call so that
// DependencyPathDialog opens from memory instead of waiting for probes.
const candidateCache = new Map<string, ReturnType<typeof get_dependency_candidates>>();
const candidateValueCache = new Map<string, DependencyCandidate[]>();

const TOOL_KEYS = ["ffmpeg", "ffprobe", "ytdlp"] as const;

/**
 * Drops all cached candidates for all tools.
 * Call this after install / uninstall / set_dependency_override so the next
 * time DependencyPathDialog opens it re-probes.
 */
export function dropCandidateCache(): void {
	candidateCache.clear();
	candidateValueCache.clear();
}

function prefetchCandidates(): void {
	for (const tool of TOOL_KEYS) {
		const p = get_dependency_candidates(tool, false);
		p.then((val) => {
			candidateValueCache.set(tool, val);
		}).catch(() => {});
		candidateCache.set(tool, p);
	}
}

/**
 * Returns a cached Promise<DependencyCandidate[]> for the given tool, or starts
 * a fresh probe if none is cached yet.
 */
export function getCachedCandidates(toolKey: string): ReturnType<typeof get_dependency_candidates> {
	const cached = candidateCache.get(toolKey);
	if (cached) return cached;
	const p = get_dependency_candidates(toolKey, false);
	p.then((val) => {
		candidateValueCache.set(toolKey, val);
	}).catch(() => {});
	candidateCache.set(toolKey, p);
	return p;
}

/**
 * Returns synchronously resolved candidates if already available in memory,
 * allowing dialogs to mount on frame 0 with zero loading delay.
 */
export function getSyncCachedCandidates(toolKey: string): DependencyCandidate[] | undefined {
	return candidateValueCache.get(toolKey);
}

function notifyListeners() {
	listeners.forEach((l) => l());
}

/**
 * Triggers backend dependency check and updates global cache.
 * Called automatically ONCE on app startup, and on explicit dependency actions (install/uninstall/check updates).
 *
 * A call that lands while a fetch is already in flight is coalesced into a
 * single queued re-fetch (at most one behind the in-flight one) rather than
 * being dropped in favor of the stale cache — previously, a `recheck()`
 * fired right after an uninstall could be swallowed entirely, leaving every
 * consumer (tool cards, "Install All Missing", the header badge) on the
 * pre-uninstall report indefinitely.
 */
export function refreshDependencies(): Promise<DependencyReport | null> {
	if (inflight) {
		queued ??= inflight.then(() => {
			queued = null;
			return refreshDependencies();
		});
		return queued;
	}

	inflight = (async () => {
		try {
			cachedReport = await get_dependencies();
			notifyListeners();
			// After a successful dependency refresh, re-probe all candidates in
			// the background so DependencyPathDialog is instant next time.
			prefetchCandidates();
		} catch (e) {
			console.error("Failed to fetch dependencies", e);
		} finally {
			// Cleared before this promise resolves, so a queued continuation
			// chained off `inflight.then(...)` always starts a genuinely new fetch.
			inflight = null;
		}
		return cachedReport;
	})();

	return inflight;
}

// Initial app startup check (runs once on client load)
if (typeof window !== "undefined") {
	refreshDependencies();
}


export type DependencyHookResult = DependencyCurrentState & {
	recheck: () => Promise<DependencyReport | null>;
};

export default function useDependency(): DependencyHookResult {
	const [state, setState] = useState<DependencyCurrentState>(() => {
		if (cachedReport) {
			return { status: "ready", deps: cachedReport };
		}
		return { status: "loading" };
	});

	useEffect(() => {
		// Sync local state with global cache
		function handleChange() {
			if (cachedReport) {
				setState({ status: "ready", deps: cachedReport });
			}
		}

		listeners.add(handleChange);
		if (cachedReport && state.status === "loading") {
			handleChange();
		}

		return () => {
			listeners.delete(handleChange);
		};
	}, [state.status]);

	const recheck = useCallback(async (): Promise<DependencyReport | null> => {
		return await refreshDependencies();
	}, []);

	// Stabilize the return identity: only produces a new object when
	// the actual state reference or recheck function changes.
	// Previously `{ ...state, recheck }` created a fresh object every render,
	// forcing all consumers to re-render even when nothing changed.
	return useMemo<DependencyHookResult>(
		() => ({ ...state, recheck }),
		[state, recheck],
	);
}
