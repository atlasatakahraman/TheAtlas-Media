"use client";

import { useCallback, useEffect } from "react";
import { toast } from "sonner";

import { useOptimisticAction } from "@/lib/optimistic";
import { kv_delete, kv_entries, kv_set } from "@/lib/prefs-env";
import { createStore, useStore, type Store } from "@/lib/store";
import { errorMessage, type JsonValue } from "@/lib/types";

/**
 * Reading and writing one persisted preference, with the write showing up
 * before the backend has agreed to it.
 *
 * The shape follows `use-dependency.ts`: one module-level store per namespace,
 * shared by every consumer, so the same key toggled in a list row and read in
 * the sidebar paints identically on the same frame. A provider would have
 * scoped it to a subtree and a per-component `useState` would have let two
 * views disagree.
 */

type NamespaceState = {
	values: Record<string, JsonValue>;
	/** False until the first read lands. Writes still work before then — they
	 *  merge into whatever the read returns. */
	loaded: boolean;
};

const namespaces = new Map<string, Store<NamespaceState>>();
const loading = new Map<string, Promise<void>>();

function storeFor(namespace: string): Store<NamespaceState> {
	let store = namespaces.get(namespace);
	if (!store) {
		store = createStore<NamespaceState>({ values: {}, loaded: false });
		namespaces.set(namespace, store);
	}
	return store;
}

/**
 * Read a namespace once per session.
 *
 * Guarded on `window` because the static export prerenders these modules under
 * Node, where there is no Tauri host to invoke. A failure leaves `loaded`
 * false and clears the latch, so a later mount retries rather than leaving the
 * app permanently unable to read its own preferences.
 */
function ensureLoaded(namespace: string): void {
	if (typeof window === "undefined") return;
	if (loading.has(namespace) || storeFor(namespace).get().loaded) return;

	const promise = kv_entries(namespace)
		.then((values) => {
			// Merged *under* whatever is already staged: a write that happened
			// while this read was in flight is newer than the read's answer.
			storeFor(namespace).set((previous) => ({
				values: { ...values, ...previous.values },
				loaded: true,
			}));
		})
		.catch((error: unknown) => {
			loading.delete(namespace);
			console.error(`Failed to read preferences for "${namespace}"`, error);
		});

	loading.set(namespace, promise);
}

/**
 * Synchronous read, no fetch. Returns `fallback` until the namespace has
 * loaded — the frame-0 answer, so a toggle never renders unset and then jumps.
 */
export function peekPref<T extends JsonValue>(
	namespace: string,
	key: string,
	fallback: T,
): T {
	const value = namespaces.get(namespace)?.get().values[key];
	return value === undefined || value === null ? fallback : (value as T);
}

/** Write without a component. Same store, so every mounted reader updates. */
export async function setPref(
	namespace: string,
	key: string,
	value: JsonValue,
): Promise<void> {
	const store = storeFor(namespace);
	const previous = store.get().values[key];

	store.set((state) => ({ ...state, values: { ...state.values, [key]: value } }));

	try {
		await kv_set(namespace, key, value);
	} catch (error) {
		store.set((state) => {
			const values = { ...state.values };
			if (previous === undefined) delete values[key];
			else values[key] = previous;
			return { ...state, values };
		});
		throw error;
	}
}

export async function deletePref(namespace: string, key: string): Promise<void> {
	const store = storeFor(namespace);
	const previous = store.get().values[key];

	store.set((state) => {
		const values = { ...state.values };
		delete values[key];
		return { ...state, values };
	});

	try {
		await kv_delete(namespace, key);
	} catch (error) {
		if (previous !== undefined) {
			store.set((state) => ({
				...state,
				values: { ...state.values, [key]: previous },
			}));
		}
		throw error;
	}
}

export type UsePrefResult<T> = {
	/** Paint this. Already reflects an in-flight write. */
	value: T;
	/** True while a write is in flight. Drive opacity, never geometry. */
	pending: boolean;
	/** False until the namespace's first read lands. */
	ready: boolean;
	/** Write. Accepts a value or a function of the current one. */
	set: (next: T | ((previous: T) => T)) => void;
	remove: () => void;
};

/**
 * One preference, read and written optimistically.
 *
 * ```ts
 * const favorite = usePref(PREF_NAMESPACE.flags, `fav:${id}`, false);
 * <OptimisticToggle pressed={favorite.value} onToggle={() => favorite.set((v) => !v)} />
 * ```
 *
 * A failed write reverts and toasts. Rapid repeat clicks are safe: the
 * sequence guard inside `useOptimisticAction` means only the newest write may
 * report a result, so a stale rejection cannot undo a newer intent.
 */
export function usePref<T extends JsonValue>(
	namespace: string,
	key: string,
	fallback: T,
): UsePrefResult<T> {
	const store = storeFor(namespace);

	// The read is an effect, not a render-time call: `ensureLoaded` writes to a
	// module store, and doing that during render is a side effect React is
	// free to run twice.
	useEffect(() => {
		ensureLoaded(namespace);
	}, [namespace]);

	const selectValue = useCallback(
		(state: NamespaceState) => {
			const raw = state.values[key];
			return raw === undefined || raw === null ? fallback : (raw as T);
		},
		[key, fallback],
	);
	const selectLoaded = useCallback((state: NamespaceState) => state.loaded, []);

	const current = useStore(store, selectValue);
	const ready = useStore(store, selectLoaded);

	const commit = useCallback(
		async (next: T) => {
			await kv_set(namespace, key, next);
			// Only written after the backend accepts it. Until then the value on
			// screen is React's optimistic one, which unwinds by itself if this
			// throws — writing here first would make the revert a no-op.
			store.set((state) => ({
				...state,
				values: { ...state.values, [key]: next },
			}));
		},
		[namespace, key, store],
	);

	const onError = useCallback((error: unknown) => {
		toast.error(errorMessage(error, "Could not save that preference"));
	}, []);

	const action = useOptimisticAction<T>({ current, commit, onError });

	const set = useCallback(
		(next: T | ((previous: T) => T)) => action.run(next),
		[action],
	);

	const remove = useCallback(() => {
		void deletePref(namespace, key).catch((error: unknown) => {
			toast.error(errorMessage(error, "Could not clear that preference"));
		});
	}, [namespace, key]);

	return { value: action.value, pending: action.pending, ready, set, remove };
}
