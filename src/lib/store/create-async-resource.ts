"use client";

import { useEffect } from "react";
import { createStore, shallowEqual, useStore, type Store } from "./create-store";

export type ResourceStatus = "idle" | "loading" | "ready" | "error";

export type ResourceState<T> = {
	status: ResourceStatus;
	/** Last successful value. Retained across a refresh so the UI never blanks. */
	data: T | undefined;
	error: unknown;
	/** `Date.now()` of the last successful settle, or 0 if never. */
	updatedAt: number;
	/** True while a fetch is in flight, even when `data` is already populated. */
	revalidating: boolean;
};

export type ResourceOptions<T> = {
	/** Debug label; also used by `createKeyedResource` as the cache key. */
	key: string;
	fetcher: () => Promise<T>;
	/** Milliseconds a value stays fresh. 0 (default) means always refetch. */
	ttl?: number;
	/** Seed value available to `peek()` before the first fetch resolves. */
	initialData?: T;
};

export type AsyncResource<T> = {
	key: string;
	store: Store<ResourceState<T>>;
	/** Synchronously available value, for frame-0 render. Never throws. */
	peek(): T | undefined;
	/** Returns cached data if fresh, otherwise fetches. Concurrent calls share one promise. */
	read(): Promise<T | undefined>;
	/** Always refetches. Calls landing mid-flight collapse into one queued rerun. */
	refresh(): Promise<T | undefined>;
	/** Drops the cached value and marks the resource stale. */
	invalidate(): void;
	subscribe(listener: () => void): () => void;
};

/**
 * A single cached async value with request coalescing.
 *
 * Folds together three caches that were hand-rolled separately before:
 *   - the inflight/queued pair in `refreshDependencies()`
 *   - the module-level promise memo in `system-env.ts` / `window-env.ts`
 *   - the `sizeCache` map in `use-install.ts`
 *
 * The coalescing rule matters and is preserved exactly: a `refresh()` that
 * arrives while a fetch is in flight is *queued* rather than dropped. Dropping
 * it was a real bug shape — a recheck fired right after an uninstall could be
 * swallowed in favour of the stale in-flight result.
 */
export function createAsyncResource<T>({
	key,
	fetcher,
	ttl = 0,
	initialData,
}: ResourceOptions<T>): AsyncResource<T> {
	const store = createStore<ResourceState<T>>({
		status: initialData === undefined ? "idle" : "ready",
		data: initialData,
		error: null,
		updatedAt: 0,
		revalidating: false,
	});

	let inflight: Promise<T | undefined> | null = null;
	let queued: Promise<T | undefined> | null = null;

	function isFresh(): boolean {
		const { status, updatedAt } = store.get();
		if (status !== "ready") return false;
		if (ttl <= 0) return false;
		return Date.now() - updatedAt < ttl;
	}

	function runFetch(): Promise<T | undefined> {
		store.patch({
			revalidating: true,
			status: store.get().data === undefined ? "loading" : store.get().status,
		});

		const promise = fetcher()
			.then((value) => {
				store.set({
					status: "ready",
					data: value,
					error: null,
					updatedAt: Date.now(),
					revalidating: false,
				});
				return value;
			})
			.catch((error: unknown) => {
				store.patch({
					// Keep the last good data — an error should not blank the view.
					status: store.get().data === undefined ? "error" : "ready",
					error,
					revalidating: false,
				});
				return undefined;
			})
			.finally(() => {
				if (inflight === promise) inflight = null;
			});

		inflight = promise;
		return promise;
	}

	function refresh(): Promise<T | undefined> {
		if (!inflight) return runFetch();

		// One fetch already running. Chain at most one rerun behind it; further
		// callers arriving in the same window join that same queued rerun.
		if (queued) return queued;

		queued = inflight
			.catch(() => undefined)
			.then(() => {
				queued = null;
				return runFetch();
			});

		return queued;
	}

	return {
		key,
		store,

		peek: () => store.get().data,

		read() {
			if (isFresh()) return Promise.resolve(store.get().data);
			if (inflight) return inflight;
			return runFetch();
		},

		refresh,

		invalidate() {
			store.patch({ status: "idle", updatedAt: 0 });
		},

		subscribe: store.subscribe,
	};
}

export type UseResourceResult<T> = {
	data: T | undefined;
	status: ResourceStatus;
	error: unknown;
	revalidating: boolean;
	refresh: () => Promise<T | undefined>;
};

/**
 * Subscribes to a resource and kicks off its first read on mount.
 *
 * Pass `auto: false` for resources that should only load on an explicit user
 * action rather than on render.
 */
export function useResource<T>(
	resource: AsyncResource<T>,
	auto = true
): UseResourceResult<T> {
	const state = useStore(resource.store, selectResourceView, shallowEqual);

	useEffect(() => {
		if (!auto) return;
		void resource.read();
	}, [resource, auto]);

	return { ...state, refresh: resource.refresh };
}

function selectResourceView<T>(state: ResourceState<T>) {
	return {
		data: state.data,
		status: state.status,
		error: state.error,
		revalidating: state.revalidating,
	};
}

/**
 * A family of resources sharing one fetcher, keyed by an arbitrary string —
 * the `sizeCache` shape, where each tool has its own independently-cached
 * lookup. Resources are created lazily and then retained.
 */
export function createKeyedResource<T>(
	namespace: string,
	fetcher: (key: string) => Promise<T>,
	options?: { ttl?: number }
) {
	const cache = new Map<string, AsyncResource<T>>();

	function forKey(key: string): AsyncResource<T> {
		const existing = cache.get(key);
		if (existing) return existing;

		const resource = createAsyncResource<T>({
			key: `${namespace}:${key}`,
			fetcher: () => fetcher(key),
			ttl: options?.ttl,
		});
		cache.set(key, resource);
		return resource;
	}

	return {
		forKey,
		/** Sync read across the family, for frame-0 dialog opens. */
		peek: (key: string): T | undefined => cache.get(key)?.peek(),
		invalidateAll(): void {
			for (const resource of cache.values()) resource.invalidate();
		},
		clear(): void {
			cache.clear();
		},
	};
}
