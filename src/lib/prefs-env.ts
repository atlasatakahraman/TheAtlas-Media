import { invoke } from "@tauri-apps/api/core";

import type { JsonValue } from "./types";

/**
 * IPC wrapper for the backend key/value store (`src-tauri/src/core/store/kv.rs`).
 *
 * Values are namespaced. A namespace becomes a file name on disk, so the
 * backend refuses anything outside `[A-Za-z0-9._-]` — pick namespaces at
 * module scope from the constants below rather than building them from user
 * input, and a rejection can never reach a user.
 */

/** Namespaces this app uses. One file each under `<appdata>/prefs/`. */
export const PREF_NAMESPACE = {
	/** General app settings. */
	app: "app",
	/** Per-item flags the optimistic layer writes: favourites, pins. */
	flags: "flags",
	/** Download/convert output directory and concurrency. */
	media: "media",
} as const;

export type PrefNamespace = (typeof PREF_NAMESPACE)[keyof typeof PREF_NAMESPACE];

export async function kv_get(namespace: string, key: string): Promise<JsonValue | null> {
	return await invoke<JsonValue | null>("kv_get", { namespace, key });
}

/**
 * Every pair in a namespace, in one round trip.
 *
 * What a hook reads on mount. One call for the whole namespace beats one per
 * key, and it is what lets `use-pref` answer synchronously from frame 0 after
 * the first read.
 */
export async function kv_entries(namespace: string): Promise<Record<string, JsonValue>> {
	return await invoke<Record<string, JsonValue>>("kv_entries", { namespace });
}

export async function kv_set(namespace: string, key: string, value: JsonValue): Promise<void> {
	return await invoke("kv_set", { namespace, key, value });
}

/** Shallow-merge several keys at once. Absent means unchanged. */
export async function kv_patch(
	namespace: string,
	values: Record<string, JsonValue>,
): Promise<void> {
	return await invoke("kv_patch", { namespace, values });
}

/** Resolves to whether the key existed. */
export async function kv_delete(namespace: string, key: string): Promise<boolean> {
	return await invoke<boolean>("kv_delete", { namespace, key });
}
