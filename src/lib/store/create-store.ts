"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

export type Store<T> = {
	/** Current value. Safe to call outside React (event handlers, IPC callbacks). */
	get(): T;
	/** Replace the value, or derive it from the previous one. */
	set(next: T | ((prev: T) => T)): void;
	/** Shallow-merge for object states. No-ops if nothing actually changed. */
	patch(partial: Partial<T>): void;
	subscribe(listener: () => void): () => void;
	/** Re-read the initial value; used by resources on invalidation. */
	reset(): void;
};

/**
 * Minimal module-level store on `useSyncExternalStore`.
 *
 * This generalises the pattern that was hand-rolled in `use-dependency.ts`
 * (a module-scope value plus a `Set` of listeners). Stores are created at
 * module scope, never inside a component, so state survives navigation and is
 * shared by every consumer without a provider.
 */
export function createStore<T>(initial: T): Store<T> {
	let value = initial;
	const listeners = new Set<() => void>();

	// Notifications are coalesced onto a microtask so a burst of writes in one
	// tick wakes each subscriber once. Reads stay synchronous — `get()` always
	// returns the latest value, so there is no window where a subscriber could
	// observe a stale snapshot.
	let scheduled = false;
	function notify(): void {
		if (scheduled) return;
		scheduled = true;
		queueMicrotask(() => {
			scheduled = false;
			for (const listener of listeners) listener();
		});
	}

	return {
		get: () => value,

		set(next) {
			const resolved =
				typeof next === "function" ? (next as (prev: T) => T)(value) : next;
			if (Object.is(resolved, value)) return;
			value = resolved;
			notify();
		},

		patch(partial) {
			const current = value as T & object;
			let changed = false;
			for (const key of Object.keys(partial) as (keyof T)[]) {
				if (!Object.is(current[key], partial[key])) {
					changed = true;
					break;
				}
			}
			if (!changed) return;
			value = { ...current, ...partial };
			notify();
		},

		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},

		reset() {
			if (Object.is(value, initial)) return;
			value = initial;
			notify();
		},
	};
}

const identity = <T,>(value: T): T => value as unknown as T;

/**
 * Subscribes a component to a slice of a store.
 *
 * The selected value is memoised against the source snapshot's identity, so an
 * inline selector that builds a fresh object each call still produces a stable
 * snapshot and cannot drive `useSyncExternalStore` into a render loop.
 *
 * Static export prerenders these components, so the server snapshot is the
 * same read — the store holds no request state, only client-side app state.
 */
export function useStore<T>(store: Store<T>): T;
export function useStore<T, S>(
	store: Store<T>,
	selector: (state: T) => S,
	isEqual?: (a: S, b: S) => boolean
): S;
export function useStore<T, S>(
	store: Store<T>,
	selector: (state: T) => S = identity as unknown as (state: T) => S,
	isEqual: (a: S, b: S) => boolean = Object.is
): S {
	const cache = useRef<{ source: T; selected: S } | null>(null);

	const getSnapshot = useCallback(() => {
		const source = store.get();
		const previous = cache.current;

		// Same source object — the selector is pure, so the previous output holds.
		if (previous !== null && Object.is(previous.source, source)) {
			return previous.selected;
		}

		const selected = selector(source);

		// Source changed but the slice did not: keep the old reference so React
		// sees an unchanged snapshot and skips the re-render.
		if (previous !== null && isEqual(previous.selected, selected)) {
			cache.current = { source, selected: previous.selected };
			return previous.selected;
		}

		cache.current = { source, selected };
		return selected;
	}, [store, selector, isEqual]);

	return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

/** Shallow object equality, for selectors that build a small result object. */
export function shallowEqual<S>(a: S, b: S): boolean {
	if (Object.is(a, b)) return true;
	if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
		return false;
	}

	const aKeys = Object.keys(a) as (keyof S)[];
	const bKeys = Object.keys(b) as (keyof S)[];
	if (aKeys.length !== bKeys.length) return false;

	for (const key of aKeys) {
		if (!Object.is(a[key], b[key])) return false;
	}
	return true;
}
