"use client";

import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";

export type InstallStatus =
	| "idle"
	| "downloading"
	| "extracting"
	| "verifying"
	| "installed"
	| "failed";

export type InstallProgress = {
	name: string;
	status: InstallStatus;
	progress: number;
	message: string;
};

export type InstallStates = Record<string, InstallProgress>;

/**
 * Hook for managing dependency installation state and listening to
 * backend progress events streamed via `app.emit("install-progress", ...)`.
 *
 * Follows the same listener cleanup pattern as `use-maximize.ts`.
 */
export function useInstall() {
	const [states, setStates] = useState<InstallStates>({});

	useEffect(() => {
		let unlisten: UnlistenFn | undefined;
		let cancelled = false;

		async function setup() {
			unlisten = await listen<InstallProgress>(
				"install-progress",
				(event) => {
					if (cancelled) return;
					setStates((prev) => ({
						...prev,
						[event.payload.name]: event.payload,
					}));
				},
			);
		}

		setup();

		return () => {
			cancelled = true;
			unlisten?.();
		};
	}, []);

	const install = useCallback(async (name: string) => {
		setStates((prev) => ({
			...prev,
			[name]: {
				name,
				status: "downloading",
				progress: 0,
				message: "Starting…",
			},
		}));
		await invoke("install_dependency", { name });
	}, []);

	const installAll = useCallback(async () => {
		await invoke("install_all_missing");
	}, []);

	return { states, install, installAll };
}
