"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
	clear_webkit_cache,
	get_app_storage_size_mb,
	get_webkit_cache_size_mb,
	open_app_storage_dir,
} from "@/lib/dependency-env";
import { createAsyncResource, useResource } from "@/lib/store/create-async-resource";
import { formatSizeMb } from "@/lib/utils";

// Both sizes are module-level resources, so navigating away and back reuses the
// last measurement instead of re-walking the directory tree.
const appStorageSize = createAsyncResource<number>({
	key: "app-storage-mb",
	fetcher: get_app_storage_size_mb,
});

const webviewCacheSize = createAsyncResource<number>({
	key: "webkit-cache-mb",
	fetcher: get_webkit_cache_size_mb,
});

/** Re-measures managed storage. Safe to call from anywhere after a mutation. */
export function refreshAppStorageSize(): void {
	void appStorageSize.refresh();
}

export type AppStorage = {
	/** Managed-storage footprint in MB, or null until first measured. */
	appStorageMb: number | null;
	/** WebView cache in MB, or null until first measured. */
	webviewCacheMb: number | null;
	isClearingCache: boolean;
	isOpeningStorageDir: boolean;
	clearCache: () => Promise<void>;
	openStorageDir: (event?: React.MouseEvent) => Promise<void>;
};

/**
 * On-disk footprint of the app: managed dependency storage and the WebView
 * cache, plus the two actions that change them.
 */
export default function useAppStorage(): AppStorage {
	const storage = useResource(appStorageSize);
	const cache = useResource(webviewCacheSize);

	const [isClearingCache, setIsClearingCache] = useState(false);
	const [isOpeningStorageDir, setIsOpeningStorageDir] = useState(false);

	const clearCache = useCallback(async () => {
		setIsClearingCache(true);
		try {
			const cleared = await clear_webkit_cache();
			toast.success(`Cache cleared${cleared > 0 ? ` (${formatSizeMb(cleared)} freed)` : ""}`);
			// Show the result immediately, then confirm against disk.
			webviewCacheSize.store.patch({ data: 0 });
			void webviewCacheSize.refresh();
			void appStorageSize.refresh();
		} catch (e) {
			toast.error("Failed to clear cache: " + String(e));
		} finally {
			setIsClearingCache(false);
		}
	}, []);

	// The OS file manager takes a moment to come forward; without this guard a
	// second click during that window spawns a second window.
	const openingRef = useRef(false);
	const openStorageDir = useCallback(async (event?: React.MouseEvent) => {
		if (event) {
			event.stopPropagation();
			event.preventDefault();
		}
		if (openingRef.current) return;
		openingRef.current = true;
		setIsOpeningStorageDir(true);
		try {
			const path = await open_app_storage_dir();
			toast.success("Opened managed storage folder", { description: path });
		} catch (e) {
			toast.error(`Failed to open storage folder: ${String(e)}`);
		} finally {
			openingRef.current = false;
			setIsOpeningStorageDir(false);
		}
	}, []);

	return {
		appStorageMb: storage.data ?? null,
		webviewCacheMb: cache.data ?? null,
		isClearingCache,
		isOpeningStorageDir,
		clearCache,
		openStorageDir,
	};
}
