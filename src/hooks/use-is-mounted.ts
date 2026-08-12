"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/**
 * Returns `true` only after client-side hydration is complete.
 * Uses `useSyncExternalStore` with diverging server/client snapshots
 * to avoid hydration mismatches while preventing SSR flash.
 *
 * Shared across Header and DependenciesPage.
 */
export function useIsMounted(): boolean {
	return useSyncExternalStore(
		emptySubscribe,
		() => true,
		() => false,
	);
}
