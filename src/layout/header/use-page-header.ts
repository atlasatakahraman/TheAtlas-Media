"use client";

import { useEffect } from "react";
import { createStore, useStore } from "@/lib/store/create-store";
import type { PageHeaderOverride } from "./types";

const EMPTY: PageHeaderOverride = {};

/**
 * Runtime header state, owned outside React so a page can retitle the shell
 * without the header having to know that page exists.
 */
const overrideStore = createStore<PageHeaderOverride>(EMPTY);

/**
 * Lets a page drive the header title while it is mounted.
 *
 *   usePageHeader({ title: `Downloading — ${percent}%` });
 *
 * The override clears on unmount, so navigating away restores the registry
 * title with no cleanup at the call site.
 */
export function usePageHeader(override: PageHeaderOverride): void {
	const { title, breadcrumb } = override;

	useEffect(() => {
		overrideStore.set({ title, breadcrumb });
		return () => overrideStore.set(EMPTY);
	}, [title, breadcrumb]);
}

/** Read the current override. Returns an empty object when none is set. */
export function usePageHeaderOverride(): PageHeaderOverride {
	return useStore(overrideStore);
}

/** Imperative escape hatch for non-React callers (IPC event handlers). */
export function setPageHeader(override: PageHeaderOverride): void {
	overrideStore.set(override);
}

export function clearPageHeader(): void {
	overrideStore.set(EMPTY);
}
