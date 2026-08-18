"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { dropCandidateCache } from "@/hooks/use-dependency";
import {
	check_for_updates,
	get_download_size_mb,
	install_dependency,
	install_tools,
	uninstall_dependency,
} from "@/lib/dependency-env";
import { createKeyedResource } from "@/lib/store/create-async-resource";
import { createStore, useStore } from "@/lib/store/create-store";
import { formatSizeMb } from "@/lib/utils";
import { aliasesOf, getTool, TOOLS } from "@/registry/tools";

export type InstallStatus =
	| "idle"
	| "checkingManifest"
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

// ── Install progress ──────────────────────────────────────────────────────────
// One module-level store and one event subscription for the whole app. Before
// this, every `useInstall()` call site opened its own listener and kept its own
// copy of the progress map, so an install started from the header badge left
// the dependencies page showing nothing until the first backend event arrived.

const progressStore = createStore<Record<string, InstallProgress>>({});

/** Writes one progress value under every spelling of the tool's name. */
function writeProgress(name: string, progress: InstallProgress): void {
	progressStore.set((prev) => {
		const next = { ...prev };
		for (const alias of aliasesOf(name)) next[alias] = progress;
		return next;
	});
}

function writeProgressMany(names: string[], build: (name: string) => InstallProgress): void {
	progressStore.set((prev) => {
		const next = { ...prev };
		for (const name of names) {
			const progress = build(name);
			for (const alias of aliasesOf(name)) next[alias] = progress;
		}
		return next;
	});
}

let listenerStarted = false;

/**
 * Subscribes to the backend's `install-progress` stream, once per app.
 *
 * Started lazily from the first mounted consumer rather than at import: the
 * static export prerenders these modules in Node, where there is no Tauri host
 * to listen to.
 */
function ensureProgressListener(): void {
	if (listenerStarted || typeof window === "undefined") return;
	listenerStarted = true;

	listen<InstallProgress>("install-progress", (event) => {
		writeProgress(event.payload.name, event.payload);
	}).catch((error: unknown) => {
		// Let a later mount retry rather than leaving the app permanently deaf.
		listenerStarted = false;
		console.error("Failed to subscribe to install progress", error);
	});
}

// ── Download sizes ────────────────────────────────────────────────────────────
// Keyed by the backend's own spelling, so the resource key is exactly what the
// command expects and the aliases collapse onto one cache entry.

const downloadSizes = createKeyedResource<number>(
	"download-size",
	(name) => get_download_size_mb(name),
	{ ttl: Number.MAX_SAFE_INTEGER }
);

function sizeKey(name: string): string {
	return getTool(name)?.installName ?? name;
}

/** Cached size, if one has already resolved. Never triggers a fetch. */
function peekDownloadSize(name: string): number | undefined {
	const cached = downloadSizes.peek(sizeKey(name));
	return cached !== undefined && cached > 0 ? cached : undefined;
}

/** Cached size, fetching if needed. Resolves to 0 when the lookup fails. */
async function resolveDownloadSize(name: string): Promise<number> {
	return (await downloadSizes.forKey(sizeKey(name)).read()) ?? 0;
}

/**
 * Total bytes actually transferred for a set of tools.
 *
 * FFmpeg and FFprobe ship in one archive, so counting both would roughly
 * double the figure shown to the user. Returns undefined until every size is
 * known — a partial total reads as authoritative and is worse than a spinner.
 */
function computeBundleTotalSize(tools: ToolInstallInfo[]): number | undefined {
	if (!tools.every((tool) => tool.sizeMb !== undefined && tool.sizeMb > 0)) return undefined;

	let total = 0;
	let ffmpegBundleCounted = false;

	for (const tool of tools) {
		if (tool.name === "ffmpeg" || tool.name === "ffprobe") {
			if (ffmpegBundleCounted) continue;
			ffmpegBundleCounted = true;
		}
		total += tool.sizeMb ?? 0;
	}
	return total;
}

const ALL_INSTALL_NAMES = TOOLS.map((tool) => tool.installName);

// ── Actions ───────────────────────────────────────────────────────────────────
// Module-level so they keep a stable identity across renders and can be called
// from outside React.

async function install(name: string): Promise<void> {
	writeProgress(name, {
		name,
		status: "checkingManifest",
		progress: 0,
		message: "Starting…",
	});

	try {
		await install_dependency(name);
	} catch (e) {
		writeProgress(name, { name, status: "failed", progress: 0, message: String(e) });
		toast.error(`Failed to start installation for ${name}: ${String(e)}`);
	}
}

async function installAll(toolNames?: string[]): Promise<void> {
	const targets = toolNames && toolNames.length > 0 ? toolNames : [...ALL_INSTALL_NAMES];

	writeProgressMany(targets, (name) => ({
		name,
		status: "checkingManifest",
		progress: 0,
		message: "Starting…",
	}));

	try {
		await install_tools(targets);
	} catch (e) {
		writeProgressMany(targets, (name) => ({
			name,
			status: "failed",
			progress: 0,
			message: String(e),
		}));
		toast.error(`Failed to start installing tools: ${String(e)}`);
	}
}

async function uninstall(name: string): Promise<boolean> {
	try {
		await uninstall_dependency(name);
		// The binary moved; the path picker must re-probe before it is trusted.
		dropCandidateCache();
		return true;
	} catch (e) {
		toast.error(`Failed to uninstall ${name}: ${String(e)}`);
		return false;
	}
}

/**
 * Drops a tool's progress entry.
 *
 * Without this, a stale "installed" from earlier in the session keeps the card
 * claiming success after an uninstall — the backend report is the source of
 * truth and needs the local snapshot out of its way.
 */
function clearState(name: string): void {
	progressStore.set((prev) => {
		const aliases = aliasesOf(name);
		if (!aliases.some((alias) => alias in prev)) return prev;
		const next = { ...prev };
		for (const alias of aliases) delete next[alias];
		return next;
	});
}

async function checkForUpdates(force: boolean = false): Promise<void> {
	await check_for_updates(force);
}

export function useInstall() {
	const states = useStore(progressStore);
	const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);

	useEffect(() => {
		ensureProgressListener();
	}, []);

	// Read by `confirmAndInstall` so it never closes over a stale target while
	// staying out of the callback's dependency array.
	const confirmTargetRef = useRef<ConfirmTarget | null>(null);
	useEffect(() => {
		confirmTargetRef.current = confirmTarget;
	}, [confirmTarget]);

	// ── Confirm: single tool ──────────────────────────────────────────────
	// Opens immediately with whatever size is cached — `undefined` renders a
	// shimmer — then patches once the lookup lands. Waiting for the size before
	// opening would put a network round-trip between the click and the dialog.
	const requestConfirm = useCallback(
		(
			name: string,
			currentVersion?: string | null,
			targetVersion?: string | null,
			title?: string
		) => {
			const cachedSize = peekDownloadSize(name);
			const isInstalled = currentVersion && currentVersion !== "Not Installed";

			setConfirmTarget({
				name,
				title: title ?? (isInstalled ? `Update ${name}?` : `Install ${name}?`),
				sizeMb: cachedSize,
				isAll: false,
				toolsInfo: [
					{
						name,
						currentVersion: currentVersion ?? null,
						targetVersion: targetVersion ?? null,
						sizeMb: cachedSize,
					},
				],
			});

			if (cachedSize !== undefined) return;

			void resolveDownloadSize(name).then((resolved) => {
				const sizeMb = resolved > 0 ? resolved : undefined;
				setConfirmTarget((prev) => {
					// The dialog may have been closed, or reopened for another
					// tool, while the lookup was in flight.
					if (!prev || prev.name !== name || prev.isAll) return prev;
					return {
						...prev,
						sizeMb,
						toolsInfo: prev.toolsInfo.map((tool) =>
							tool.name === name ? { ...tool, sizeMb } : tool
						),
					};
				});
			});
		},
		[]
	);

	// ── Confirm: several tools at once ────────────────────────────────────
	const requestConfirmAll = useCallback((tools: ToolInstallInfo[], title?: string) => {
		const seeded = tools.map((tool) => ({ ...tool, sizeMb: peekDownloadSize(tool.name) }));

		const isAnyMissing = seeded.some(
			(tool) => !tool.currentVersion || tool.currentVersion === "Not Installed"
		);
		const computedTitle =
			title ?? (isAnyMissing ? "Install All Missing Dependencies" : "Install All Updates");

		setConfirmTarget({
			name: computedTitle,
			title: computedTitle,
			sizeMb: computeBundleTotalSize(seeded),
			isAll: true,
			toolsInfo: seeded,
		});

		const uncached = seeded.filter((tool) => tool.sizeMb === undefined);
		if (uncached.length === 0) return;

		void Promise.all(
			uncached.map(async (tool) => [tool.name, await resolveDownloadSize(tool.name)] as const)
		).then((resolved) => {
			const resolvedByName = new Map(resolved);
			setConfirmTarget((prev) => {
				if (!prev || !prev.isAll) return prev;
				const updated = prev.toolsInfo.map((tool) => {
					const size = resolvedByName.get(tool.name) ?? tool.sizeMb;
					return { ...tool, sizeMb: size && size > 0 ? size : undefined };
				});
				return { ...prev, sizeMb: computeBundleTotalSize(updated), toolsInfo: updated };
			});
		});
	}, []);

	const closeConfirm = useCallback(() => setConfirmTarget(null), []);

	const confirmAndInstall = useCallback(async () => {
		const target = confirmTargetRef.current;
		if (!target) return;
		setConfirmTarget(null);
		if (target.isAll) await installAll(target.toolsInfo.map((tool) => tool.name));
		else await install(target.name);
	}, []);

	const showUpdateToast = useCallback(
		async (name: string) => {
			const sizeMb = await resolveDownloadSize(name);
			toast.info(`Update available for ${name}`, {
				description: `Download size: ${
					sizeMb > 0 ? formatSizeMb(sizeMb) : "calculating size…"
				}. Click to view details.`,
				action: { label: "View", onClick: () => requestConfirm(name) },
			});
		},
		[requestConfirm]
	);

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
