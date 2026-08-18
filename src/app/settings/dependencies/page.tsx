// next@16.2.9 — verified against node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md on 2026-08-19
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import DependencyActionBar from "@/components/dependencies/action-bar";
import ClearWebKitCacheDialog from "@/components/dependencies/dialogs/clear-cache";
import DependencyInstallDialog from "@/components/dependencies/dialogs/install";
import DependencyPathDialog from "@/components/dependencies/dialogs/path-picker";
import DependencyUninstallDialog from "@/components/dependencies/dialogs/uninstall";
import UpToDateDialog from "@/components/dependencies/dialogs/up-to-date";
import type { ToolChecksumInfo } from "@/components/dependencies/dialogs/up-to-date/types";
import { isActiveInstall } from "@/components/dependencies/install-progress/functions";
import DependenciesPageSkeleton from "@/components/dependencies/skeleton";
import StorageBanner from "@/components/dependencies/storage-banner";
import ToolCard from "@/components/dependencies/tool-card";
import useAppStorage, { refreshAppStorageSize } from "@/hooks/use-app-storage";
import useDependency, { checkDependencyPaths, refreshDependencies } from "@/hooks/use-dependency";
import { useInstall } from "@/hooks/use-install";
import { useIsMounted } from "@/hooks/use-is-mounted";
import PageShell from "@/layout/page/page-shell";
import { countInstalled } from "@/components/dependencies/storage-banner/functions";
import { reveal_dependency_path } from "@/lib/dependency-env";
import { formatToolName } from "@/lib/tool-names";
import { TOOLS } from "@/registry/tools";
import {
	allManagedInstalled as areAllManagedInstalled,
	buildDepMap,
	buildToolInstallInfos,
	collectUpdateCheck,
	sortToolsByPriority,
} from "./functions";
import { PAGE_DESCRIPTION, PAGE_TITLE } from "./data";

export default function DependenciesPage() {
	const mounted = useIsMounted();
	const dependencies = useDependency();
	const {
		states: installStates,
		requestConfirm,
		requestConfirmAll,
		uninstall,
		clearState,
		checkForUpdates,
		confirmTarget,
		closeConfirm,
		confirmAndInstall,
	} = useInstall();
	const {
		appStorageMb,
		webviewCacheMb,
		isClearingCache,
		isOpeningStorageDir,
		clearCache,
		openStorageDir,
	} = useAppStorage();

	const [uninstallTarget, setUninstallTarget] = useState<string | null>(null);
	const [pathDialogTarget, setPathDialogTarget] = useState<string | null>(null);
	const [showClearCacheConfirm, setShowClearCacheConfirm] = useState(false);
	const [showUpToDateDialog, setShowUpToDateDialog] = useState(false);
	const [upToDateTools, setUpToDateTools] = useState<ToolChecksumInfo[]>([]);
	const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
	const [isCheckingPaths, setIsCheckingPaths] = useState(false);
	const [uninstallingKeys, setUninstallingKeys] = useState<Set<string>>(new Set());
	const [revealingPaths, setRevealingPaths] = useState<Set<string>>(new Set());

	const isLoading = dependencies.status === "loading";
	const report = dependencies.status === "ready" ? dependencies.deps : undefined;

	const depMap = useMemo(() => buildDepMap(report), [report]);
	const sortedTools = useMemo(() => sortToolsByPriority(depMap), [depMap]);
	const unmanagedInfos = useMemo(() => buildToolInstallInfos(report, "unmanaged"), [report]);
	const missingCount = useMemo(
		() => buildToolInstallInfos(report, "missing").length,
		[report]
	);
	const allManaged = useMemo(() => areAllManagedInstalled(report), [report]);
	const isAnyInstalling = useMemo(
		() => Object.values(installStates).some((state) => isActiveInstall(state?.status)),
		[installStates]
	);

	// Re-read the report and the storage footprint the moment a tool finishes
	// installing. Tracked per tool so a second install in the same session still
	// fires, and reset while a tool is mid-install so a retry counts again.
	const handledInstalledKeys = useRef<Set<string>>(new Set());
	useEffect(() => {
		let shouldRefresh = false;
		for (const [key, state] of Object.entries(installStates)) {
			if (state?.status === "installed") {
				if (!handledInstalledKeys.current.has(key)) {
					handledInstalledKeys.current.add(key);
					shouldRefresh = true;
				}
			} else if (isActiveInstall(state?.status)) {
				handledInstalledKeys.current.delete(key);
			}
		}
		if (shouldRefresh) {
			void refreshDependencies();
			refreshAppStorageSize();
		}
	}, [installStates]);

	const handleInstallAllManagedClick = useCallback(() => {
		if (isCheckingUpdates || isCheckingPaths) {
			toast.warning("Check is currently in progress. Please wait until it completes.");
			return;
		}
		const hasUnmanaged = unmanagedInfos.length > 0;
		requestConfirmAll(
			hasUnmanaged ? unmanagedInfos : buildToolInstallInfos(report, "all-managed"),
			hasUnmanaged ? "Install Managed Dependencies" : "Reinstall All Managed Dependencies"
		);
	}, [isCheckingPaths, isCheckingUpdates, report, requestConfirmAll, unmanagedInfos]);

	const handleRequestSingleConfirm = useCallback(
		(key: string) => {
			const info = depMap[key];
			requestConfirm(
				key,
				info?.version ?? "Not Installed",
				info?.latestVersion ?? "Latest Release"
			);
		},
		[depMap, requestConfirm]
	);

	// An external install gets a managed copy *alongside* it rather than an
	// "update" to a binary the app does not own — so this is always framed as a
	// fresh install, whatever version the external one reports.
	const handleRequestManagedCopy = useCallback(
		(key: string) => {
			requestConfirm(
				key,
				"Not Installed",
				"Latest Release",
				`Install managed copy of ${formatToolName(key)}?`
			);
		},
		[requestConfirm]
	);

	const revealingPathsRef = useRef<Set<string>>(new Set());
	const handleRevealPath = useCallback((path: string) => {
		if (revealingPathsRef.current.has(path)) return;
		revealingPathsRef.current.add(path);
		setRevealingPaths((prev) => new Set(prev).add(path));

		reveal_dependency_path(path)
			.catch((e: unknown) => toast.error(`Failed to reveal path: ${String(e)}`))
			.finally(() => {
				revealingPathsRef.current.delete(path);
				setRevealingPaths((prev) => {
					const next = new Set(prev);
					next.delete(path);
					return next;
				});
			});
	}, []);

	const handlePathChanged = useCallback(() => {
		void refreshDependencies();
		refreshAppStorageSize();
		toast.success("Dependency path updated");
	}, []);

	const handleCheckUpdates = useCallback(async () => {
		setIsCheckingUpdates(true);
		try {
			await checkForUpdates(true);
			const { toolsToUpdate, verifiedTools } = collectUpdateCheck(
				(await refreshDependencies()) ?? undefined
			);

			if (toolsToUpdate.length > 0) {
				requestConfirmAll(
					toolsToUpdate,
					toolsToUpdate.length === 1
						? `Update ${toolsToUpdate[0].name}?`
						: "Install All Updates"
				);
			} else {
				setUpToDateTools(verifiedTools);
				setShowUpToDateDialog(true);
			}
		} catch (e) {
			toast.error("Failed to check for updates: " + String(e));
		} finally {
			setIsCheckingUpdates(false);
		}
	}, [checkForUpdates, requestConfirmAll]);

	const handleCheckPaths = useCallback(async () => {
		if (isCheckingPaths || isAnyInstalling) return;
		setIsCheckingPaths(true);
		try {
			const fresh = await checkDependencyPaths();
			refreshAppStorageSize();
			if (!fresh) return;

			const installed = countInstalled(fresh);
			if (fresh.allInstalled) {
				toast.success(
					`All dependency paths checked and verified (${installed}/${TOOLS.length} installed)`
				);
			} else {
				toast.info(
					`Dependency paths checked (${installed}/${TOOLS.length} installed, ${TOOLS.length - installed} missing)`
				);
			}
		} catch (e) {
			toast.error("Failed to check dependency paths: " + String(e));
		} finally {
			setIsCheckingPaths(false);
		}
	}, [isAnyInstalling, isCheckingPaths]);

	const handleUninstallConfirm = useCallback(async () => {
		if (!uninstallTarget) return;
		const name = uninstallTarget;
		setUninstallTarget(null);
		setUninstallingKeys((prev) => new Set(prev).add(name));

		try {
			if (!(await uninstall(name))) return;
			// Drop the stale progress entry first, so the card falls back to the
			// backend report rather than a frozen "installed" snapshot.
			clearState(name);
			await refreshDependencies();
			refreshAppStorageSize();
			toast.success(`${formatToolName(name)} uninstalled`);
		} finally {
			setUninstallingKeys((prev) => {
				const next = new Set(prev);
				next.delete(name);
				return next;
			});
		}
	}, [clearState, uninstall, uninstallTarget]);

	const handleClearCacheConfirm = useCallback(() => {
		setShowClearCacheConfirm(false);
		void clearCache();
	}, [clearCache]);

	return (
		<PageShell
			title={PAGE_TITLE}
			description={PAGE_DESCRIPTION}
			icon="Package"
			actions={
				<DependencyActionBar
					mounted={mounted}
					isLoading={isLoading}
					isAnyInstalling={isAnyInstalling}
					webviewCacheMb={webviewCacheMb}
					isClearingCache={isClearingCache}
					onClearCacheClick={() => setShowClearCacheConfirm(true)}
					isCheckingPaths={isCheckingPaths}
					onCheckPaths={handleCheckPaths}
					isCheckingUpdates={isCheckingUpdates}
					onCheckUpdates={handleCheckUpdates}
					allManagedInstalled={allManaged}
					onInstallAllManagedClick={handleInstallAllManagedClick}
				/>
			}
		>
			{!mounted || isLoading ? (
				<DependenciesPageSkeleton />
			) : (
				<>
					<StorageBanner
						report={report}
						missingCount={missingCount}
						appStorageMb={appStorageMb}
						isOpeningStorageDir={isOpeningStorageDir}
						onOpenStorageDir={openStorageDir}
					/>

					<div className="grid grid-cols-1 gap-4">
						{sortedTools.map((tool) => (
							<ToolCard
								key={tool.key}
								tool={tool}
								info={depMap[tool.key]}
								installState={installStates[tool.key]}
								mounted={mounted}
								isLoading={isLoading}
								isUninstalling={uninstallingKeys.has(tool.key)}
								isRevealingPath={Boolean(
									depMap[tool.key]?.path &&
										revealingPaths.has(depMap[tool.key]!.path!)
								)}
								onInstallClick={handleRequestSingleConfirm}
								onUninstallClick={setUninstallTarget}
								onInstallManagedClick={handleRequestManagedCopy}
								onRevealPath={handleRevealPath}
								onChangePathClick={setPathDialogTarget}
							/>
						))}
					</div>
				</>
			)}

			<DependencyInstallDialog
				confirmTarget={confirmTarget}
				onClose={closeConfirm}
				onConfirm={confirmAndInstall}
			/>

			<DependencyUninstallDialog
				targetTool={uninstallTarget}
				onClose={() => setUninstallTarget(null)}
				onConfirm={handleUninstallConfirm}
			/>

			<ClearWebKitCacheDialog
				open={showClearCacheConfirm}
				cacheSizeMb={webviewCacheMb}
				onClose={() => setShowClearCacheConfirm(false)}
				onConfirm={handleClearCacheConfirm}
			/>

			<UpToDateDialog
				open={showUpToDateDialog}
				onClose={() => setShowUpToDateDialog(false)}
				tools={upToDateTools}
			/>

			<DependencyPathDialog
				toolKey={pathDialogTarget}
				currentPath={pathDialogTarget ? (depMap[pathDialogTarget]?.path ?? null) : null}
				onClose={() => setPathDialogTarget(null)}
				onChanged={handlePathChanged}
			/>
		</PageShell>
	);
}
