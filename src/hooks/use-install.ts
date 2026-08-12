"use client";

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export type InstallStatus = "idle" | "downloading" | "extracting" | "verifying" | "installed" | "failed";

export type InstallProgress = {
	name: string;
	status: InstallStatus;
	progress: number;
	message: string;
};

export type ToolInstallInfo = {
	name: string;
	currentVersion?: string | null;
	targetVersion?: string | null;
	sizeMb?: number;
};

export type ConfirmTarget = {
	name: string;
	sizeMb: number;
	isAll?: boolean;
	toolsInfo: ToolInstallInfo[];
};

export function useInstall() {
	const [states, setStates] = useState<Record<string, InstallProgress>>({});
	const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);

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

	const requestConfirm = useCallback(
		async (name: string, currentVersion?: string | null, targetVersion?: string | null) => {
			let sizeMb = 0;
			try {
				sizeMb = await invoke<number>("get_download_size_mb", { name });
			} catch {
				sizeMb = 0;
			}
			const toolInfo: ToolInstallInfo = {
				name,
				currentVersion: currentVersion ?? null,
				targetVersion: targetVersion ?? null,
				sizeMb,
			};
			setConfirmTarget({
				name,
				sizeMb,
				isAll: false,
				toolsInfo: [toolInfo],
			});
		},
		[],
	);

	const requestConfirmAll = useCallback(async (tools: ToolInstallInfo[]) => {
		let totalSizeMb = 0;
		const updatedTools: ToolInstallInfo[] = [];

		for (const t of tools) {
			let sizeMb = 0;
			try {
				sizeMb = await invoke<number>("get_download_size_mb", { name: t.name });
			} catch {
				sizeMb = 0;
			}
			totalSizeMb += sizeMb;
			updatedTools.push({ ...t, sizeMb });
		}

		setConfirmTarget({
			name: "All Missing Dependencies",
			sizeMb: totalSizeMb,
			isAll: true,
			toolsInfo: updatedTools,
		});
	}, []);

	const closeConfirm = useCallback(() => {
		setConfirmTarget(null);
	}, []);

	const confirmAndInstall = useCallback(async () => {
		if (!confirmTarget) return;
		const target = confirmTarget;
		setConfirmTarget(null);
		if (target.isAll) {
			await installAll();
		} else {
			await install(target.name);
		}
	}, [confirmTarget, install, installAll]);

	const showUpdateToast = useCallback(
		async (name: string) => {
			let sizeMb = 0;
			try {
				sizeMb = await invoke<number>("get_download_size_mb", { name });
			} catch {
				sizeMb = 0;
			}
			const sizeStr = sizeMb > 0 ? `~${sizeMb.toFixed(1)} MB` : "calculating size…";
			toast.info(`Update available for ${name}`, {
				description: `Download size: ${sizeStr}. Click to view details.`,
				action: {
					label: "View",
					onClick: () => requestConfirm(name),
				},
			});
		},
		[requestConfirm],
	);

	const checkForUpdates = useCallback(async (force: boolean = false) => {
		await invoke("check_for_updates", { force });
	}, []);

	const uninstall = useCallback(async (name: string) => {
		await invoke("uninstall_dependency", { name });
	}, []);

	return {
		states,
		install,
		installAll,
		uninstall,
		checkForUpdates,
		confirmTarget,
		requestConfirm,
		requestConfirmAll,
		closeConfirm,
		confirmAndInstall,
		showUpdateToast,
	};
}
