// next@16.2.9 — verified against node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md on 2026-06-21
"use client";

import { invoke } from "@tauri-apps/api/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
	DependencyInstallDialog,
	DependencyUninstallDialog,
} from "@/components/dependency-dialogs";
import useDependency from "@/hooks/use-dependency";
import { useInstall, InstallStatus, type ToolInstallInfo } from "@/hooks/use-install";
import { DependencyInfo } from "@/lib/types";
import { formatSizeMb } from "@/lib/utils";
import {
	CheckCircle2,
	Download,
	HardDrive,
	Info,
	Loader2,
	Package,
	RefreshCw,
	ShieldAlert,
	ShieldCheck,
	Terminal,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

const emptySubscribe = () => () => {};
function useIsMounted() {
	return useSyncExternalStore(
		emptySubscribe,
		() => true,
		() => false,
	);
}

function isActiveInstall(status: InstallStatus | undefined): boolean {
	return status === "downloading" || status === "extracting" || status === "verifying";
}

const TOOLS_CONFIG = [
	{
		key: "ffmpeg",
		name: "FFmpeg",
		description: "Core multimedia framework used for video transcoding, container muxing, and video editing.",
		features: ["Video Transcoding", "MP4/MKV Muxing", "Audio Extraction", "Trimming"],
		icon: Terminal,
	},
	{
		key: "ffprobe",
		name: "FFprobe",
		description: "Media stream analyzer used for detecting audio/video codecs, frame rate, resolution, and bitrates.",
		features: ["Format Inspector", "Codec Detection", "Stream Bitrates", "Metadata"],
		icon: Info,
	},
	{
		key: "ytdlp",
		name: "yt-dlp",
		description: "Advanced media downloader CLI used for extracting videos, audio, playlists, and metadata from YouTube.",
		features: ["YouTube 4K & Audio", "Playlists & Channels", "Subtitles", "Metadata"],
		icon: Download,
	},
];

export default function DependenciesPage() {
	const mounted = useIsMounted();
	const dependencies = useDependency();
	const {
		states: installStates,
		requestConfirm,
		requestConfirmAll,
		uninstall,
		checkForUpdates,
		confirmTarget,
		closeConfirm,
		confirmAndInstall,
	} = useInstall();

	const [uninstallTarget, setUninstallTarget] = useState<string | null>(null);
	const [appStorageMb, setAppStorageMb] = useState<number | null>(null);

	const fetchStorageSize = useCallback(async () => {
		try {
			const size = await invoke<number>("get_app_storage_size_mb");
			setAppStorageMb(size);
		} catch {
			setAppStorageMb(null);
		}
	}, []);

	useEffect(() => {
		fetchStorageSize();
	}, [fetchStorageSize, installStates, dependencies]);

	// Re-check dependency status when an install completes
	const prevInstalledRef = useRef(false);
	useEffect(() => {
		const anyInstalled = Object.values(installStates).some((s) => s.status === "installed");
		if (anyInstalled && !prevInstalledRef.current) {
			prevInstalledRef.current = true;
			dependencies.recheck();
		} else if (!anyInstalled) {
			prevInstalledRef.current = false;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [installStates]);

	const depMap = useMemo<Record<string, DependencyInfo | undefined>>(() => {
		if (dependencies.status === "loading") return {};
		const { ffmpeg, ffprobe, ytdlp } = dependencies.deps;
		return { ffmpeg, ffprobe, ytdlp, "yt-dlp": ytdlp };
	}, [dependencies]);

	const installedCount = useMemo(() => {
		if (dependencies.status === "loading") return 0;
		const { ffmpeg, ffprobe, ytdlp } = dependencies.deps;
		let count = 0;
		if (ffmpeg.status === "installed") count++;
		if (ffprobe.status === "installed") count++;
		if (ytdlp.status === "installed") count++;
		return count;
	}, [dependencies]);

	const missingToolInfos = useMemo<ToolInstallInfo[]>(() => {
		if (dependencies.status === "loading") return [];
		const items: ToolInstallInfo[] = [];
		const { ytdlp, ffmpeg, ffprobe } = dependencies.deps;
		if (ytdlp.status === "notInstalled") {
			items.push({
				name: "yt-dlp",
				currentVersion: ytdlp.version ?? "Not Installed",
				targetVersion: ytdlp.latestVersion ?? "Latest Release",
			});
		}
		if (ffmpeg.status === "notInstalled") {
			items.push({
				name: "ffmpeg",
				currentVersion: ffmpeg.version ?? "Not Installed",
				targetVersion: ffmpeg.latestVersion ?? "Latest Release",
			});
		}
		if (ffprobe.status === "notInstalled" && !items.some((i) => i.name === "ffmpeg")) {
			items.push({
				name: "ffprobe",
				currentVersion: ffprobe.version ?? "Not Installed",
				targetVersion: ffprobe.latestVersion ?? "Latest Release",
			});
		}
		return items;
	}, [dependencies]);

	const hasMissing = useMemo(() => {
		if (dependencies.status === "loading") return false;
		return !dependencies.deps.allInstalled;
	}, [dependencies]);

	const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);

	const isAnyInstalling = useMemo(() => {
		return Object.values(installStates).some((s) => isActiveInstall(s?.status));
	}, [installStates]);

	const handleInstallAllClick = useCallback(() => {
		if (isCheckingUpdates) {
			toast.warning("Update check is currently in progress. Please wait until it completes.");
			return;
		}
		if (missingToolInfos.length > 0) {
			requestConfirmAll(missingToolInfos);
		}
	}, [isCheckingUpdates, missingToolInfos, requestConfirmAll]);

	const handleRequestSingleConfirm = useCallback(
		(key: string) => {
			const info = depMap[key];
			requestConfirm(
				key,
				info?.version ?? "Not Installed",
				info?.latestVersion ?? "Latest Release",
			);
		},
		[depMap, requestConfirm],
	);

	const handleCheckUpdates = useCallback(async () => {
		setIsCheckingUpdates(true);
		try {
			await checkForUpdates(true);
			const report = await dependencies.recheck();

			const missingTools: ToolInstallInfo[] = [];
			if (report) {
				if (report.ytdlp.status === "notInstalled") {
					missingTools.push({
						name: "yt-dlp",
						currentVersion: report.ytdlp.version ?? "Not Installed",
						targetVersion: report.ytdlp.latestVersion ?? "Latest Release",
					});
				}
				if (report.ffmpeg.status === "notInstalled") {
					missingTools.push({
						name: "ffmpeg",
						currentVersion: report.ffmpeg.version ?? "Not Installed",
						targetVersion: report.ffmpeg.latestVersion ?? "Latest Release",
					});
				}
				if (report.ffprobe.status === "notInstalled" && !missingTools.some((i) => i.name === "ffmpeg")) {
					missingTools.push({
						name: "ffprobe",
						currentVersion: report.ffprobe.version ?? "Not Installed",
						targetVersion: report.ffprobe.latestVersion ?? "Latest Release",
					});
				}
			}

			if (missingTools.length > 0) {
				requestConfirmAll(missingTools);
			} else {
				toast.success("All dependencies are up to date!");
			}
		} catch (e) {
			toast.error("Failed to check for updates: " + String(e));
		} finally {
			setIsCheckingUpdates(false);
		}
	}, [checkForUpdates, dependencies, requestConfirmAll]);

	const handleUninstallConfirm = useCallback(async () => {
		if (!uninstallTarget) return;
		const name = uninstallTarget;
		setUninstallTarget(null);
		await uninstall(name);
		dependencies.recheck();
		fetchStorageSize();
	}, [uninstallTarget, uninstall, dependencies, fetchStorageSize]);

	return (
		<div className="flex-1 p-6 md:p-8 max-w-5xl mx-auto space-y-6 select-none">
			{/* Page Header */}
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
				<div className="space-y-1">
					<div className="flex items-center gap-2.5 text-foreground font-serif font-normal text-2xl">
						<Package className="w-5 h-5 text-primary" />
						<span>Dependency Manager</span>
					</div>
					<p className="text-sm text-muted-foreground">
						Manage binary tools required for video conversion, media downloading, and stream analysis.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						disabled={isCheckingUpdates || isAnyInstalling}
						onClick={handleCheckUpdates}
						className="gap-1.5 border-border rounded-md text-xs font-medium"
					>
						{isCheckingUpdates ? (
							<Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
						) : (
							<RefreshCw className="w-3.5 h-3.5" />
						)}
						Check Updates
					</Button>
					{mounted && hasMissing && (
						<Button
							size="sm"
							disabled={isAnyInstalling}
							onClick={handleInstallAllClick}
							className="gap-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium"
						>
							{isAnyInstalling ? (
								<>
									<Loader2 className="w-3.5 h-3.5 animate-spin" />
									Installing All…
								</>
							) : (
								<>
									<Download className="w-3.5 h-3.5" />
									Install All Missing
								</>
							)}
						</Button>
					)}
				</div>
			</div>

			{/* Status Overview Banner */}
			{mounted && dependencies.status !== "loading" && (
				<div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-sidebar-border bg-sidebar/50 text-xs">
					<div className="flex flex-wrap items-center gap-3">
						<div className="flex items-center gap-1.5 font-normal text-foreground">
							<CheckCircle2 className="w-4 h-4 text-chart-1" />
							<span>Installed: <span className="font-medium">{installedCount}/3</span></span>
						</div>
						{hasMissing && (
							<div className="flex items-center gap-1.5 font-normal text-destructive">
								<ShieldAlert className="w-4 h-4" />
								<span>Missing: <span className="font-medium">{missingToolInfos.length}</span></span>
							</div>
						)}
						<div className="flex items-center gap-1.5 font-normal text-foreground border-l border-sidebar-border/60 pl-3">
							<HardDrive className="w-4 h-4 text-primary shrink-0" />
							<span>Total Used Storage in Application:</span>
							<span className="font-mono text-primary font-medium">
								{formatSizeMb(appStorageMb)}
							</span>
						</div>
					</div>
					<div className="flex items-center gap-2 text-muted-foreground text-[11px]">
						<span>Managed App Storage</span>
						<span className="opacity-40">•</span>
						<ShieldCheck className="w-3.5 h-3.5 text-chart-1 shrink-0" />
						<span>Verified SHA-256 Checksums • Zero Telemetry</span>
					</div>
				</div>
			)}

			{/* Dependencies List */}
			<div className="grid grid-cols-1 gap-4">
				{TOOLS_CONFIG.map((tool) => {
					const info = depMap[tool.key];
					const installState = installStates[tool.key];
					const isInstalling = isActiveInstall(installState?.status);
					const Icon = tool.icon;

					const isInstalled = mounted && dependencies.status !== "loading" && info?.status === "installed";
					const isManaged = isInstalled && info?.source === "managed";

					return (
						<Card
							key={tool.key}
							className="bg-sidebar border-sidebar-border shadow-xs transition-colors py-0 rounded-2xl"
						>
							<CardContent className="p-5 space-y-4">
								<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
									<div className="flex items-start gap-3">
										<div className="p-2.5 rounded-xl bg-secondary text-foreground border border-sidebar-border shrink-0">
											<Icon className="w-5 h-5 text-primary" />
										</div>
										<div className="space-y-1">
											<div className="flex items-center gap-2">
												<h3 className="font-serif font-normal text-foreground text-lg">{tool.name}</h3>
												{!mounted || dependencies.status === "loading" ? (
													<Badge variant="outline" className="text-xs rounded-full">
														<Loader2 className="w-3 h-3 animate-spin mr-1" /> Loading
													</Badge>
												) : isInstalled ? (
													<Badge variant="outline" className="bg-chart-1/10 text-chart-1 border-chart-1/30 text-xs gap-1 rounded-full font-medium">
														<CheckCircle2 className="w-3.5 h-3.5" /> Installed
													</Badge>
												) : (
													<Badge variant="destructive" className="text-xs gap-1 rounded-full font-medium">
														<ShieldAlert className="w-3.5 h-3.5" /> Missing
													</Badge>
												)}
											</div>
											<p className="text-xs text-muted-foreground leading-relaxed">{tool.description}</p>
											
											{/* Feature Chips */}
											<div className="flex flex-wrap items-center gap-1.5 pt-1">
												{tool.features.map((feat) => (
													<span
														key={feat}
														className="rounded-full border border-sidebar-border bg-background/50 px-2.5 py-0.5 text-[11px] text-muted-foreground font-medium"
													>
														{feat}
													</span>
												))}
											</div>
										</div>
									</div>

									{/* Action Buttons */}
									<div className="flex items-center gap-2 shrink-0 sm:self-start">
										<Button
											size="sm"
											variant={isInstalled ? "outline" : "default"}
											disabled={isInstalling || !mounted}
											onClick={() => handleRequestSingleConfirm(tool.key)}
											className="gap-1.5 text-xs rounded-md border-sidebar-border font-medium"
										>
											{isInstalling ? (
												<>
													<Loader2 className="w-3.5 h-3.5 animate-spin" />
													Installing…
												</>
											) : isInstalled ? (
												<>
													<RefreshCw className="w-3.5 h-3.5" />
													Reinstall / Update
												</>
											) : (
												<>
													<Download className="w-3.5 h-3.5" />
													Install
												</>
											)}
										</Button>

										{/* Uninstall Managed Binary Button */}
										{isManaged && (
											<Button
												size="sm"
												variant="destructive"
												disabled={isInstalling}
												onClick={() => setUninstallTarget(tool.key)}
												className="gap-1.5 text-xs rounded-md font-medium"
											>
												<Trash2 className="w-3.5 h-3.5" />
												Uninstall
											</Button>
										)}
									</div>
								</div>

								{/* Progress Bar (when downloading) */}
								{isInstalling && installState && (
									<div className="space-y-1.5 pt-2 border-t border-sidebar-border/60">
										<div className="flex justify-between text-xs text-muted-foreground font-medium">
											<span className="capitalize">{installState.status}…</span>
											<span>{installState.message}</span>
										</div>
										<Progress value={installState.progress} className="h-1.5 bg-secondary rounded-full" />
									</div>
								)}

								{/* Tool Metadata Info */}
								{isInstalled && info && (
									<div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 text-xs border-t border-sidebar-border/60 text-muted-foreground">
										<div className="flex items-center gap-1.5">
											<HardDrive className="w-3.5 h-3.5 text-primary/70 shrink-0" />
											<span className="font-medium text-foreground">Source:</span>
											<span className="capitalize font-mono text-[11px]">{info.source}</span>
										</div>
										<div className="flex items-center gap-1.5 sm:col-span-2 truncate">
											<Terminal className="w-3.5 h-3.5 text-primary/70 shrink-0" />
											<span className="font-medium text-foreground shrink-0">Path:</span>
											<span className="truncate font-mono text-[11px] bg-background/50 px-2 py-0.5 rounded-md border border-sidebar-border/50">
												{info.path ?? "N/A"}
											</span>
										</div>
										{info.version && (
											<div className="flex items-center gap-1.5 sm:col-span-2 truncate">
												<Info className="w-3.5 h-3.5 text-primary/70 shrink-0" />
												<span className="font-medium text-foreground shrink-0">Version:</span>
												<span className="truncate font-mono text-[11px] bg-background/50 px-2 py-0.5 rounded-md border border-sidebar-border/50">
													{info.version}
												</span>
											</div>
										)}
										{info.sizeMb && info.sizeMb > 0 && (
											<div className="flex items-center gap-1.5">
												<HardDrive className="w-3.5 h-3.5 text-primary/70 shrink-0" />
												<span className="font-medium text-foreground shrink-0">Binary Size:</span>
												<span className="font-mono text-[11px] bg-background/50 px-2 py-0.5 rounded-md border border-sidebar-border/50">
													{formatSizeMb(info.sizeMb)}
												</span>
											</div>
										)}
										{info.sha256 && (
											<div className="flex items-center gap-1.5 sm:col-span-3 truncate pt-1 border-t border-sidebar-border/40">
												<ShieldCheck className="w-3.5 h-3.5 text-chart-1 shrink-0" />
												<span className="font-medium text-foreground shrink-0">SHA-256 Checksum:</span>
												<span
													className="truncate font-mono text-[11px] bg-background/50 px-2 py-0.5 rounded-md border border-sidebar-border/50 text-foreground cursor-pointer hover:bg-background transition-colors"
													title={`Click to copy SHA-256 hash:\n${info.sha256}`}
													onClick={() => {
														navigator.clipboard.writeText(info.sha256!);
														toast.success(`Copied ${tool.name} SHA-256 checksum`);
													}}
												>
													sha256:{info.sha256.slice(0, 12)}…{info.sha256.slice(-8)}
												</span>
											</div>
										)}
									</div>
								)}
							</CardContent>
						</Card>
					);
				})}
			</div>

			{/* Confirm Download & Install AlertDialog */}
			<DependencyInstallDialog
				confirmTarget={confirmTarget}
				onClose={closeConfirm}
				onConfirm={confirmAndInstall}
			/>

			{/* Confirm Uninstall Managed Dependency AlertDialog */}
			<DependencyUninstallDialog
				targetTool={uninstallTarget}
				onClose={() => setUninstallTarget(null)}
				onConfirm={handleUninstallConfirm}
			/>
		</div>
	);
}
