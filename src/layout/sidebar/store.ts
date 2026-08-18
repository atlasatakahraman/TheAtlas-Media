"use client";

import { useCallback } from "react";
import { createStore, useStore } from "@/lib/store/create-store";

type SidebarState = {
	/** Explicit user toggles, keyed by `NavItem.id`. Absent means "not touched". */
	expanded: Record<string, boolean>;
};

/**
 * One store for the whole tree.
 *
 * Previously every `RenderMenuItem` owned its own `Record<string, boolean>` of
 * toggled groups — 105 separate state objects, each holding a map that only
 * ever had entries for its own subtree, and none of it surviving a re-mount.
 */
const sidebarStore = createStore<SidebarState>({ expanded: {} });

/**
 * Whether a group is open.
 *
 * `autoOpen` is the default when the user has never touched this group — it is
 * true for groups containing the active route. An explicit toggle always wins,
 * so collapsing the active branch stays collapsed.
 */
export function useGroupExpanded(id: string, autoOpen: boolean): boolean {
	const selector = useCallback(
		(state: SidebarState) => state.expanded[id],
		[id]
	);
	const toggled = useStore(sidebarStore, selector);
	return toggled === undefined ? autoOpen : toggled;
}

export function toggleGroup(id: string, autoOpen: boolean): void {
	sidebarStore.set((previous) => {
		const current = previous.expanded[id] ?? autoOpen;
		return { expanded: { ...previous.expanded, [id]: !current } };
	});
}

/** Drops every explicit toggle, letting the active route govern again. */
export function resetGroups(): void {
	sidebarStore.set({ expanded: {} });
}
