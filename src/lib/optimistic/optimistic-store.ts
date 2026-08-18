"use client";

import { useCallback } from "react";
import { createStore, useStore, type Store } from "@/lib/store/create-store";

export type OptimisticOverlay<V> = {
	store: Store<Record<string, V>>;
	/** Stage a pending value for `key`. Reads see it immediately, everywhere. */
	set(key: string, value: V): void;
	/** Drop the pending value — call once the backend value has landed. */
	clear(key: string): void;
	clearAll(): void;
	/** Sync read of the pending value, or undefined if nothing is staged. */
	peek(key: string): V | undefined;
};

/**
 * A keyed overlay of in-flight values layered over whatever the authoritative
 * source says.
 *
 * `useOptimisticAction` alone is component-local: a favourite toggled in a list
 * row would not show as favourited in the sidebar until the IPC resolved. This
 * store lifts that pending value to module scope so every consumer of the same
 * key paints the new state on the same frame.
 */
export function createOptimisticOverlay<V>(): OptimisticOverlay<V> {
	const store = createStore<Record<string, V>>({});

	return {
		store,

		set(key, value) {
			store.set((previous) =>
				Object.is(previous[key], value) ? previous : { ...previous, [key]: value }
			);
		},

		clear(key) {
			store.set((previous) => {
				if (!(key in previous)) return previous;
				const next = { ...previous };
				delete next[key];
				return next;
			});
		},

		clearAll() {
			store.set((previous) => (Object.keys(previous).length === 0 ? previous : {}));
		},

		peek: (key) => store.get()[key],
	};
}

/**
 * Reads `key` through the overlay, falling back to the authoritative value.
 * Re-renders only when this key's staged value changes — not when an unrelated
 * key is staged or cleared.
 */
export function useOverlaidValue<V>(
	overlay: OptimisticOverlay<V>,
	key: string,
	base: V
): V {
	const selector = useCallback(
		(state: Record<string, V>) => state[key],
		[key]
	);
	const staged = useStore(overlay.store, selector);
	return staged === undefined ? base : staged;
}
