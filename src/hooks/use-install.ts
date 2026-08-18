"use client";

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { dropCandidateCache } from "@/hooks/use-dependency";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { formatSizeMb } from "@/lib/utils";

export type InstallStatus = "idle" | "checkingManifest" | "downloading" | "extracting" | "verifying" | "installed" | "failed";

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
	title?: string;
	sizeMb: number | undefined;
	isAll?: boolean;
	toolsInfo: ToolInstallInfo[];
};

// ── Module-level download size cache ─────────────────────────────────────────
// Avoids redundant IPC round-trips for the same tool across clicks/re-renders.
const sizeCache = new Map<string, number>();

function getAliasKeys(name: string): [string, string] {
	const norm = name === "yt-dlp" ? "ytdlp" : name;
	const alt = name === "ytdlp" ? "yt-dlp" : name;
	return [norm, alt];
}

async function getCachedDownloadSize(name: string): Promise<number> {
	const [k1, k2] = getAliasKeys(name);
	const cached = sizeCache.get(k1) ?? sizeCache.get(k2);
	if (cached !== undefined && cached > 0) return cached;
	try {
		const sizeMb = await invoke<number>("get_download_size_mb", { name });
		if (sizeMb > 0) {
			sizeCache.set(k1, sizeMb);
			sizeCache.set(k2, sizeMb);
		}
		return sizeMb;
	} catch {
		return 0;
	}
}

export function useInstall() {
	const [states, setStates] = useState<Record<string, InstallProgress>>({});
	const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);

	// Keep a ref so confirmAndInstall always reads the latest target
	// without needing it in the dependency array (avoids stale closures).
	const confirmTargetRef = useRef<ConfirmTarget | null>(null);
	useEffect(() => {
		confirmTargetRef.current = confirmTarget;
	}, [confirmTarget]);

	useEffect(() => {
		let unlisten: UnlistenFn | undefined;
		let cancelled = false;

		async function setup() {
			unlisten = await listen<InstallProgress>(
				"install-progress",
				(event) => {
					if (cancelled) return;
					const [k1, k2] = getAliasKeys(event.payload.name);

					setStates((prev) => ({
						...prev,
						[k1]: event.payload,
						[k2]: event.payload,
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
		const [k1, k2] = getAliasKeys(name);
		const initialProgress: InstallProgress = {
			name,
			status: "checkingManifest",
			progress: 0,
			message: "Starting…",
		};

		setStates((prev) => ({
			...prev,
			[k1]: initialProgress,
			[k2]: initialProgress,
		}));

		try {
			await invoke("install_dependency", { name });
		} catch (e) {
			const errProgress: InstallProgress = {
				name,
				status: "failed",
				progress: 0,
				message: String(e),
			};
			setStates((prev) => ({
				...prev,
				[k1]: errProgress,
				[k2]: errProgress,
			}));
			toast.error(`Failed to start installation for ${name}: ${String(e)}`);
		}
	}, []);

	const installAll = useCallback(async (toolNames?: string[]) => {
		const targetNames =
			toolNames && toolNames.length > 0 ? toolNames : ["ffmpeg", "ffprobe", "yt-dlp"];
		setStates((prev) => {
			const next = { ...prev };
			for (const t of targetNames) {
				const [k1, k2] = getAliasKeys(t);
				const p: InstallProgress = {
					name: t,
					status: "checkingManifest",
					progress: 0,
					message: "Starting…",
				};
				next[k1] = p;
				next[k2] = p;
			}
			return next;
		});

		try {
			await invoke("install_tools", { names: targetNames });
		} catch (e) {
			setStates((prev) => {
				const next = { ...prev };
				for (const t of targetNames) {
					const [k1, k2] = getAliasKeys(t);
					const errP: InstallProgress = {
						name: t,
						status: "failed",
						progress: 0,
						message: String(e),
					};
					next[k1] = errP;
					next[k2] = errP;
				}
				return next;
			});
			toast.error(`Failed to start installing tools: ${String(e)}`);
		}
	}, []);

	// ── Instant-open confirm: single tool ────────────────────────────────
	// Opens the dialog IMMEDIATELY with sizeMb=undefined, then resolves
	// the size in the background and patches state.
	const requestConfirm = useCallback(
		(
			name: string,
			currentVersion?: string | null,
			targetVersion?: string | null,
			title?: string,
		) => {
			const cachedSize = sizeCache.get(name);
			const validSize = cachedSize && cachedSize > 0 ? cachedSize : undefined;
			const toolInfo: ToolInstallInfo = {
				name,
				currentVersion: currentVersion ?? null,
				targetVersion: targetVersion ?? null,
				sizeMb: validSize, // instant if cached > 0, undefined if not
			};
			const isInstalled = currentVersion && currentVersion !== "Not Installed";
			const defaultTitle = isInstalled ? `Update ${name}?` : `Install ${name}?`;
			const target: ConfirmTarget = {
				name,
				title: title ?? defaultTitle,
				sizeMb: toolInfo.sizeMb,
				isAll: false,
				toolsInfo: [toolInfo],
			};
			setConfirmTarget(target);

			// Fire-and-forget: resolve size in background, update if dialog is still open
			if (toolInfo.sizeMb === undefined) {
				getCachedDownloadSize(name).then((resolvedSize) => {
					setConfirmTarget((prev) => {
						if (!prev || prev.name !== name || prev.isAll) return prev;
						const validResolved = resolvedSize > 0 ? resolvedSize : undefined;
						return {
							...prev,
							sizeMb: validResolved,
							toolsInfo: prev.toolsInfo.map((t) =>
								t.name === name ? { ...t, sizeMb: validResolved } : t,
							),
						};
					});
				});
			}
		},
		[],
	);

	// Calculate total download size accounting for bundled tools (FFmpeg + FFprobe in 1 archive)
	const computeBundleTotalSize = (tools: ToolInstallInfo[]): number | undefined => {
		const allValid = tools.every((t) => t.sizeMb !== undefined && t.sizeMb > 0);
		if (!allValid) return undefined;

		let total = 0;
		let ffmpegBundleCounted = false;

		for (const t of tools) {
			if (t.name === "ffmpeg" || t.name === "ffprobe") {
				if (!ffmpegBundleCounted) {
					total += t.sizeMb ?? 0;
					ffmpegBundleCounted = true;
				}
			} else {
				total += t.sizeMb ?? 0;
			}
		}
		return total;
	};

	// ── Instant-open confirm: all missing tools ──────────────────────────
	// Opens dialog immediately with whatever sizes are cached, then
	// resolves uncached sizes concurrently and patches state.
	const requestConfirmAll = useCallback((tools: ToolInstallInfo[], title?: string) => {
		const toolsWithCachedSizes = tools.map((t) => {
			const cached = sizeCache.get(t.name);
			return {
				...t,
				sizeMb: cached && cached > 0 ? cached : undefined,
			};
		});

		const cachedTotal = computeBundleTotalSize(toolsWithCachedSizes);

		const isAnyMissing = toolsWithCachedSizes.some(
			(t) => !t.currentVersion || t.currentVersion === "Not Installed",
		);
		const defaultTitle = isAnyMissing ? "Install All Missing Dependencies" : "Install All Updates";
		const computedTitle = title ?? defaultTitle;

		const target: ConfirmTarget = {
			name: computedTitle,
			title: computedTitle,
			sizeMb: cachedTotal,
			isAll: true,
			toolsInfo: toolsWithCachedSizes,
		};
		setConfirmTarget(target);

		// Resolve uncached sizes concurrently in background
		const uncached = toolsWithCachedSizes.filter((t) => t.sizeMb === undefined);
		if (uncached.length > 0) {
			Promise.all(
				uncached.map(async (t) => ({
					name: t.name,
					sizeMb: await getCachedDownloadSize(t.name),
				})),
			).then((resolved) => {
				const resolvedMap = new Map(resolved.map((r) => [r.name, r.sizeMb]));
				setConfirmTarget((prev) => {
					if (!prev || !prev.isAll) return prev;
					const updatedTools = prev.toolsInfo.map((t) => {
						const resSize = resolvedMap.get(t.name) ?? t.sizeMb;
						return {
							...t,
							sizeMb: resSize && resSize > 0 ? resSize : undefined,
						};
					});
					const totalSize = computeBundleTotalSize(updatedTools);
					return {
						...prev,
						sizeMb: totalSize,
						toolsInfo: updatedTools,
					};
				});
			});
		}
	}, []);

	const closeConfirm = useCallback(() => {
		setConfirmTarget(null);
	}, []);

	// Use the ref to read the latest target — no stale closure issues
	const confirmAndInstall = useCallback(async () => {
		const target = confirmTargetRef.current;
		if (!target) return;
		setConfirmTarget(null);
		if (target.isAll) {
			await installAll(target.toolsInfo.map((t) => t.name));
		} else {
			await install(target.name);
		}
	}, [install, installAll]);

	const showUpdateToast = useCallback(
		async (name: string) => {
			const sizeMb = await getCachedDownloadSize(name);
			const sizeStr = sizeMb > 0 ? formatSizeMb(sizeMb) : "calculating size…";
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

	// Clear a tool's stale progress entry (e.g. a leftover "installed" state
	// from earlier in the session) so the UI falls back to trusting the
	// backend dependency report instead of a frozen local snapshot.
	const clearState = useCallback((name: string) => {
		const [k1, k2] = getAliasKeys(name);
		setStates((prev) => {
			if (!(k1 in prev) && !(k2 in prev)) return prev;
			const next = { ...prev };
			delete next[k1];
			delete next[k2];
			return next;
		});
	}, []);

	const uninstall = useCallback(async (name: string): Promise<boolean> => {
		try {
			await invoke("uninstall_dependency", { name });
			// Drop cached candidates so path picker re-probes after uninstall.
			dropCandidateCache();
			return true;
		} catch (e) {
			toast.error(`Failed to uninstall ${name}: ${String(e)}`);
			return false;
		}
	}, []);

	return {
		states,
		install,
		installAll,
		uninstall,
		clearState,
		checkForUpdates,
		confirmTarget,
		requestConfirm,
		requestConfirmAll,
		closeConfirm,
		confirmAndInstall,
		showUpdateToast,
	};
}
