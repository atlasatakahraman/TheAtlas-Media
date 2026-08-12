"use client";

import { get_dependencies } from "@/lib/dependency-env";
import { DependencyReport } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

export type DependencyCurrentState =
	| { status: "loading" }
	| { status: "ready"; deps: DependencyReport };

// Module-level global cache to avoid redundant IPC checks on component mounts/refreshes.
let cachedReport: DependencyReport | null = null;
let isFetching = false;
const listeners = new Set<() => void>();

function notifyListeners() {
	listeners.forEach((l) => l());
}

/**
 * Triggers backend dependency check and updates global cache.
 * Called automatically ONCE on app startup, and on explicit dependency actions (install/uninstall/check updates).
 */
export async function refreshDependencies(): Promise<DependencyReport | null> {
	if (isFetching) return cachedReport;
	isFetching = true;
	try {
		cachedReport = await get_dependencies();
		notifyListeners();
		return cachedReport;
	} catch (e) {
		console.error("Failed to fetch dependencies", e);
		return cachedReport;
	} finally {
		isFetching = false;
	}
}

// Initial app startup check (runs once on client load)
if (typeof window !== "undefined") {
	refreshDependencies();
}

export default function useDependency(): DependencyCurrentState & {
	recheck: () => Promise<DependencyReport | null>;
} {
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

	return { ...state, recheck };
}
