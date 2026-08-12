// next@16.2.9 — verified against node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md on 2026-06-21
"use client";

import { invoke } from "@tauri-apps/api/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
	ClearWebKitCacheDialog,
	DependencyInstallDialog,
	DependencyUninstallDialog,
	UpToDateDialog,
	type ToolChecksumInfo,
} from "@/components/dependency-dialogs";
import { DependenciesPageSkeleton } from "@/components/dependency-skeletons";
import useDependency from "@/hooks/use-dependency";
import { useIsMounted } from "@/hooks/use-is-mounted";
import { useInstall, InstallStatus, type ToolInstallInfo } from "@/hooks/use-install";
import { DependencyInfo } from "@/lib/types";
import { getOperatingSystem } from "@/lib/system-env";
import { cn, formatSizeMb } from "@/lib/utils";
import {
	Building2,
	CheckCircle2,
	Copy,
	Download,
	ExternalLink,
	HardDrive,
	Info,
	Loader2,
	Package,
	RefreshCw,
	Scale,
	ShieldAlert,
	ShieldCheck,
	Terminal,
	Trash2,
	type LucideIcon,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import ffmpegIcon from "@/assets/ffmpeg-icon.svg";
import ytdlpIcon from "@/assets/ytdlp-icon.svg";

function isActiveInstall(status: InstallStatus | undefined): boolean {
	return (
		status === "checkingManifest" ||
		status === "downloading" ||
		status === "extracting" ||
		status === "verifying"
	);
}

function installStatusLabel(status: InstallStatus): string {
	switch (status) {
		case "checkingManifest": return "Checking manifest";
		case "downloading": return "Downloading";
		case "extracting": return "Extracting";
		case "verifying": return "Verifying";
		case "installed": return "Installed";
		case "failed": return "Failed";
		default: return status;
	}
}

function normalizeVersion(v: string | null | undefined): string {
	if (!v) return "";
	let s = v.trim().toLowerCase();
	const match =
		s.match(/(?:ffmpeg|ffprobe|yt-dlp)?\s*version\s+([^\s]+)/i) ||
		s.match(/^(?:ffmpeg|ffprobe|yt-dlp)\s+([^\s]+)/i);
	if (match && match[1]) {
		s = match[1];
	}
	s = s.replace(/^v/, "").replace(/^n/, "");
	return s;
}

function checkHasUpdate(info: DependencyInfo): boolean {
	if (info.status !== "installed") return false;
	if (!info.version || !info.latestVersion) return false;
	const current = normalizeVersion(info.version);
	const latest = normalizeVersion(info.latestVersion);
	if (!latest || latest === "latest" || latest === "latest release") return false;
	return current !== latest;
}

type ToolConfig = {
	key: string;
	name: string;
	description: string;
	features: string[];
	license: string;
	publisher: string;
	websiteUrl: string;
	icon?: LucideIcon;
	logo?: typeof ffmpegIcon;
};

const TOOLS_CONFIG: ToolConfig[] = [
	{
		key: "ffmpeg",
		name: "FFmpeg",
		description:
			"Core multimedia framework used for video transcoding, container muxing, and video editing.",
		features: ["Video Transcoding", "MP4/MKV Muxing", "Audio Extraction", "Trimming"],
		license: "LGPL v2.1+ / GPL v2+",
		publisher: "FFmpeg Project & Developers",
		websiteUrl: "https://ffmpeg.org",
		logo: ffmpegIcon,
	},
	{
		key: "ffprobe",
		name: "FFprobe",
		description:
			"Media stream analyzer used for detecting audio/video codecs, frame rate, resolution, and bitrates.",
		features: ["Format Inspector", "Codec Detection", "Stream Bitrates", "Metadata"],
		license: "LGPL v2.1+ / GPL v2+",
		publisher: "FFmpeg Project & Developers",
		websiteUrl: "https://ffmpeg.org",
		logo: ffmpegIcon,
	},
	{
		key: "ytdlp",
		name: "yt-dlp",
		description:
			"Advanced media downloader CLI used for extracting videos, audio, playlists, and metadata from YouTube.",
		features: ["YouTube 4K & Audio", "Playlists & Channels", "Subtitles", "Metadata"],
		license: "Unlicense (Public Domain)",
		publisher: "yt-dlp Contributors",
		websiteUrl: "https://github.com/yt-dlp/yt-dlp",
		logo: ytdlpIcon,
	},
];

// ── Memoized ToolCard ────────────────────────────────────────────────────
interface ToolCardProps {
	tool: ToolConfig;
	info: DependencyInfo | undefined;
	installState: { status: InstallStatus; progress: number; message: string } | undefined;
	mounted: boolean;
	isLoading: boolean;
	onInstallClick: (key: string) => void;
	onUninstallClick: (key: string) => void;
}

// Shared row for a metadata field
function MetaRow({
	icon: Icon,
	label,
	children,
	verified,
}: {
	icon: LucideIcon;
	label: string;
	children: React.ReactNode;
	verified?: boolean;
}) {
	return (
		<div
			className={cn(
				"flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 py-2 min-w-0",
				verified && "**:text-chart-1",
			)}
		>
			<div className="flex items-center gap-1.5 shrink-0 max-w-3xl">
				<Icon className="w-3.5 h-3.5 text-primary/70 shrink-0" />
				<span className="text-xs font-medium text-foreground">{label}:</span>
			</div>
			<div className="flex-1 min-w-0 text-xs text-muted-foreground">{children}</div>
		</div>
	);
}

const ToolCard = React.memo(function ToolCard({
	tool,
	info,
	installState,
	mounted,
	isLoading,
	onInstallClick,
	onUninstallClick,
}: ToolCardProps) {
	const isInstalling = isActiveInstall(installState?.status);
	const Icon = tool.icon;
	const isInstalled =
		mounted &&
		!isLoading &&
		(info?.status === "installed" || installState?.status === "installed");
	const isManaged =
		isInstalled && (info?.source === "managed" || installState?.status === "installed");

	const iconElement = tool.logo ? (
		<img
			src={typeof tool.logo === "string" ? tool.logo : (tool.logo as { src: string }).src}
			alt={`${tool.name} logo`}
			width={20}
			height={20}
			className="w-5 h-5 object-contain"
		/>
	) : Icon ? (
		<Icon className="w-5 h-5 text-primary" />
	) : null;

	return (
		<Card className="bg-sidebar border-sidebar-border shadow-xs transition-colors py-0 rounded-2xl">
			<CardContent className="p-5 space-y-4">
				{/* ── Header row: icon + name + badges + action buttons ── */}
				<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
					<div className="flex items-start gap-3">
						<div className="p-2.5 rounded-xl bg-secondary text-foreground border border-sidebar-border shrink-0">
							{iconElement}
						</div>
						<div className="space-y-1">
							<div className="flex items-center gap-2">
								<h3 className="font-serif font-normal text-foreground text-lg">
									{tool.name}
								</h3>
								{!mounted || isLoading ? (
									<Badge variant="outline" className="text-xs rounded-full">
										<Loader2 className="w-3 h-3 animate-spin mr-1" /> Loading
									</Badge>
								) : isInstalled ? (
									<Badge
										variant="outline"
										className="bg-chart-1/10 text-chart-1 border-chart-1/30 text-xs gap-1 rounded-full font-medium"
									>
										<CheckCircle2 className="w-3.5 h-3.5" /> Installed
									</Badge>
								) : (
									<Badge
										variant="destructive"
										className="text-xs gap-1 rounded-full font-medium"
									>
										<ShieldAlert className="w-3.5 h-3.5" /> Missing
									</Badge>
								)}
							</div>
							<p className="text-xs text-muted-foreground leading-relaxed">
								{tool.description}
							</p>
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

					{/* Action Buttons — only shown contextually based on source */}
					<div className="flex items-center gap-2 shrink-0 sm:self-start">
						{isInstalling ? (
							<Button size="sm" variant="ghost" disabled className="gap-1.5 text-xs rounded-md font-medium">
								<Loader2 className="w-3.5 h-3.5 animate-spin" />
								Installing…
							</Button>
						) : isManaged ? (
							<>
								{/* Managed binary — can reinstall/update and uninstall */}
								<Button
									size="sm"
									variant="ghost"
									disabled={!mounted}
									onClick={() => onInstallClick(tool.key)}
									className="group/link h-auto p-0 text-xs text-muted-foreground hover:text-foreground bg-transparent hover:bg-transparent active:bg-transparent focus:bg-transparent focus-visible:bg-transparent shadow-none font-medium rounded-none outline-none ring-0 focus-visible:ring-0"
								>
									<span className="inline-flex items-center gap-1.5 border-b border-transparent group-hover/link:border-current pb-[2px] transition-colors">
										<RefreshCw className="w-3.5 h-3.5 transition-transform duration-500 ease-in-out group-hover/link:rotate-180" />
										<span>Reinstall / Update</span>
									</span>
								</Button>
								<Button
									size="sm"
									variant="destructive"
									disabled={false}
									onClick={() => onUninstallClick(tool.key)}
									className="gap-1.5 text-xs rounded-md font-medium"
								>
									<Trash2 className="w-3.5 h-3.5" />
									Uninstall
								</Button>
							</>
						) : !isInstalled ? (
							/* Not installed — show Install */
							<Button
								size="sm"
								variant="default"
								disabled={!mounted}
								onClick={() => onInstallClick(tool.key)}
								className="gap-1.5 text-xs rounded-md font-medium"
							>
								<Download className="w-3.5 h-3.5" />
								Install
							</Button>
						) : null /* System-wide path — no action buttons */}
					</div>
				</div>

				{/* Progress Panel (when installing) */}
				{isInstalling && installState && (() => {
					const isDownloading = installState.status === "downloading";
					const pct = Math.min(100, Math.max(0, installState.progress));

					return (
						<div className="rounded-xl border border-sidebar-border/60 bg-sidebar/60 p-3 space-y-2.5">
							{/* Status + percentage row */}
							<div className="flex items-center justify-between gap-2 min-w-0">
								<div className="flex items-center gap-1.5 min-w-0">
									<Loader2 className="w-3 h-3 animate-spin shrink-0 text-primary" />
									<span className="text-xs font-medium text-foreground">
										{installStatusLabel(installState.status as InstallStatus)}
									</span>
									{installState.message && !isDownloading && (
										<span className="text-xs text-muted-foreground truncate">
											— {installState.message}
										</span>
									)}
								</div>
								{isDownloading && pct > 0 && (
									<span className="text-xs font-mono font-semibold text-primary shrink-0 tabular-nums">
										{pct.toFixed(1)}%
									</span>
								)}
							</div>

							{/* Progress bar */}
							{isDownloading ? (
								<Progress
									value={pct}
									className="h-2 bg-secondary rounded-full"
								/>
							) : (
								/* Indeterminate shimmer for manifest / extract / verify phases */
								<div className="h-2 rounded-full bg-secondary overflow-hidden">
									<div className="h-full w-full rounded-full bg-primary/30 animate-pulse" />
								</div>
							)}

							{/* Download details: size + speed */}
							{isDownloading && installState.message && (
								<p className="text-[11px] font-mono text-muted-foreground leading-none tracking-tight">
									{installState.message}
								</p>
							)}
						</div>
					);
				})()}

				{/* Failed State Alert */}
				{installState?.status === "failed" && !isInstalling && (
					<div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 flex items-start gap-2.5 text-xs text-destructive">
						<ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
						<div className="space-y-0.5 min-w-0 flex-1">
							<p className="font-medium font-serif">Installation Failed</p>
							<p className="text-[11px] opacity-90 break-words font-mono">
								{installState.message || "An unknown error occurred during installation."}
							</p>
						</div>
					</div>
				)}

				<Separator className="bg-sidebar-border/60" />
				<TooltipProvider>
					<div className="divide-y divide-sidebar-border/30">
						{/* ── If installed: show dynamic fields first (most important) ── */}
						{isInstalled && info && (
							<>
								{/* 1. Version */}
								{info.version && (
									<MetaRow icon={Info} label="Version">
										<span className="inline-block font-mono text-[11px] bg-background/50 px-2 py-0.5 rounded-md border border-sidebar-border/50 break-all leading-relaxed text-muted-foreground">
											v{normalizeVersion(info.version)}
										</span>
									</MetaRow>
								)}

								{/* 2. SHA-256 Checksum */}
								{info.sha256 && (
									<MetaRow
										verified={true}
										icon={ShieldCheck}
										label="SHA-256 Checksum"
									>
										<Tooltip>
											<TooltipTrigger asChild>
												<button
													onClick={() => {
														navigator.clipboard.writeText(info.sha256!);
														toast.success(`Copied ${tool.name} SHA-256 checksum`);
													}}
													className="inline-flex items-start gap-1.5 font-mono text-[11px] bg-background/50 px-2 py-0.5 rounded-md border border-sidebar-border/50 text-muted-foreground cursor-pointer hover:bg-background transition-colors break-all text-left max-w-full"
												>
													<Copy className="w-3 h-3 shrink-0 text-primary/60 mt-0.5" />
													{info.sha256}
												</button>
											</TooltipTrigger>
											<TooltipContent side="top">Click to copy checksum</TooltipContent>
										</Tooltip>
									</MetaRow>
								)}

								{/* 3. Binary Size */}
								{info.sizeMb && info.sizeMb > 0 && (
									<MetaRow icon={HardDrive} label="Binary Size">
										<span className="inline-block font-mono text-[11px] bg-background/50 px-2 py-0.5 rounded-md border border-sidebar-border/50 text-muted-foreground">
											{formatSizeMb(info.sizeMb)}
										</span>
									</MetaRow>
								)}

								{/* 4. Source */}
								<MetaRow icon={HardDrive} label="Source">
									<span className="inline-block font-mono text-[11px] bg-background/50 px-2 py-0.5 rounded-md border border-sidebar-border/50 capitalize text-muted-foreground">
										{info.source}
									</span>
								</MetaRow>

								{/* 5. Path */}
								<MetaRow icon={Terminal} label="Path">
									<span className="inline-block font-mono text-[11px] bg-background/50 px-2 py-0.5 rounded-md border border-sidebar-border/50 break-all text-muted-foreground">
										{info.path ?? "N/A"}
									</span>
								</MetaRow>
							</>
						)}

						{/* ── Static fields (always shown) ── */}
						{/* 6. License */}
						<MetaRow icon={Scale} label="License">
							<span className="inline-block font-mono text-[11px] bg-background/50 px-2 py-0.5 rounded-md border border-sidebar-border/50 text-muted-foreground">
								{tool.license}
							</span>
						</MetaRow>

						{/* 7. Publisher */}
						<MetaRow icon={Building2} label="Publisher">
							<span className="inline-block font-mono text-[11px] bg-background/50 px-2 py-0.5 rounded-md border border-sidebar-border/50 text-muted-foreground">
								{tool.publisher}
							</span>
						</MetaRow>

						{/* 8. Credits */}
						<MetaRow icon={ExternalLink} label="Credits">
							<a
								href={tool.websiteUrl}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline bg-background/50 px-2 py-0.5 rounded-md border border-sidebar-border/50 transition-colors"
							>
								{tool.name} Official
								<ExternalLink className="w-3 h-3 opacity-70" />
							</a>
						</MetaRow>
					</div>
				</TooltipProvider>
			</CardContent>
		</Card>
	);
});

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
	const [isLinux, setIsLinux] = useState(false);
	const [webkitCacheMb, setWebkitCacheMb] = useState<number | null>(null);
	const [isClearingCache, setIsClearingCache] = useState(false);
	const [showClearCacheConfirm, setShowClearCacheConfirm] = useState(false);
	const [showUpToDateDialog, setShowUpToDateDialog] = useState(false);
	const [upToDateTools, setUpToDateTools] = useState<ToolChecksumInfo[]>([]);

	// Detect OS once on mount
	useEffect(() => {
		getOperatingSystem().then((os) => setIsLinux(os === "linux"));
	}, []);

	useEffect(() => {
		let isMounted = true;
		if (isLinux) {
			invoke<number>("get_webkit_cache_size_mb")
				.then((mb) => {
					if (isMounted) setWebkitCacheMb(mb);
				})
				.catch(() => {
					if (isMounted) setWebkitCacheMb(null);
				});
		}
		return () => {
			isMounted = false;
		};
	}, [isLinux]);

	const handleClearWebKitCache = useCallback(async () => {
		setShowClearCacheConfirm(false);
		setIsClearingCache(true);
		try {
			const cleared = await invoke<number>("clear_webkit_cache");
			const label = cleared > 0 ? ` (${formatSizeMb(cleared)} freed)` : "";
			toast.success(`WebKit cache cleared${label}`);
			setWebkitCacheMb(0);
		} catch (e) {
			toast.error("Failed to clear WebKit cache: " + String(e));
		} finally {
			setIsClearingCache(false);
		}
	}, []);

	const updateStorageSize = useCallback(() => {
		invoke<number>("get_app_storage_size_mb")
			.then(setAppStorageMb)
			.catch(() => setAppStorageMb(null));
	}, []);

	useEffect(() => {
		updateStorageSize();
	}, [updateStorageSize]);

	// Track per-tool completion and re-check dependency status & storage size on install finish
	const handledInstalledKeysRef = useRef<Set<string>>(new Set());
	useEffect(() => {
		let shouldRefresh = false;
		for (const [key, state] of Object.entries(installStates)) {
			if (state?.status === "installed") {
				if (!handledInstalledKeysRef.current.has(key)) {
					handledInstalledKeysRef.current.add(key);
					shouldRefresh = true;
				}
			} else if (isActiveInstall(state?.status)) {
				handledInstalledKeysRef.current.delete(key);
			}
		}
		if (shouldRefresh) {
			dependencies.recheck();
			updateStorageSize();
		}
	}, [installStates, dependencies, updateStorageSize]);

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

	// Sort: missing first → update available → managed installed → system installed
	const sortedTools = useMemo(() => {
		const priority = (key: string): number => {
			const info = depMap[key];
			if (!info || info.status === "notInstalled") return 0;
			if (checkHasUpdate(info)) return 1;
			if (info.source === "managed") return 2;
			return 3;
		};
		return [...TOOLS_CONFIG].sort((a, b) => priority(a.key) - priority(b.key));
	}, [depMap]);

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
			requestConfirmAll(missingToolInfos, "Install All Missing Dependencies");
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

			const toolsToUpdateOrInstall: ToolInstallInfo[] = [];
			const verifiedTools: ToolChecksumInfo[] = [];

			if (report) {
				const checkTool = (info: DependencyInfo) => {
					const isMissing = info.status === "notInstalled";
					const hasUpdate = checkHasUpdate(info);

					if (info.status === "installed" && info.sha256) {
						verifiedTools.push({
							name: info.name,
							version: info.version ?? "Installed",
							sha256: info.sha256,
						});
					}

					if (isMissing || hasUpdate) {
						if (
							info.name === "ffprobe" &&
							toolsToUpdateOrInstall.some((i) => i.name === "ffmpeg")
						) {
							return;
						}
						toolsToUpdateOrInstall.push({
							name: info.name,
							currentVersion: info.version ?? "Not Installed",
							targetVersion: info.latestVersion ?? "Latest Release",
						});
					}
				};

				checkTool(report.ytdlp);
				checkTool(report.ffmpeg);
				checkTool(report.ffprobe);
			}

			if (toolsToUpdateOrInstall.length > 0) {
				const isAnyMissing = toolsToUpdateOrInstall.some(
					(t) => t.currentVersion === "Not Installed",
				);
				const title = isAnyMissing
					? "Install All Missing Dependencies"
					: "Install All Updates";
				requestConfirmAll(toolsToUpdateOrInstall, title);
			} else {
				setUpToDateTools(verifiedTools);
				setShowUpToDateDialog(true);
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
		updateStorageSize();
	}, [uninstallTarget, uninstall, dependencies, updateStorageSize]);

	const handleUninstallClick = useCallback((key: string) => {
		setUninstallTarget(key);
	}, []);

	const isLoading = dependencies.status === "loading";

	return (
		<div className="p-6 md:p-8 space-y-6 select-none max-w-full">
			{/* Page Header */}
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
				<div className="space-y-1">
					<div className="flex items-center gap-2.5 text-foreground font-serif font-normal text-2xl">
						<Package className="w-5 h-5 text-primary" />
						<span>Dependency Manager</span>
					</div>
					<p className="text-sm text-muted-foreground">
						Manage binary tools required for video conversion, media downloading, and
						stream analysis.
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					{isLinux && (
						<Button
							variant={webkitCacheMb !== null && webkitCacheMb > 100 ? "destructive" : "outline"}
							size="sm"
							disabled={isClearingCache || !(webkitCacheMb !== null && webkitCacheMb > 100)}
							onClick={() => setShowClearCacheConfirm(true)}
							className="gap-1.5 rounded-md text-xs font-medium"
						>
							{isClearingCache ? (
								<Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
							) : (
								<Trash2 className="w-3.5 h-3.5" />
							)}
							Clear WebKit Cache
							{webkitCacheMb !== null && webkitCacheMb > 0.01 && (
								<span className="text-muted-foreground font-normal">
									({formatSizeMb(webkitCacheMb)})
								</span>
							)}
						</Button>
					)}
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
							<RefreshCw className="w-3.5 h-3.5 transition-transform duration-500 ease-in-out group-hover/button:rotate-180 group-active/button:rotate-360" />
						)}
						Check Updates
					</Button>
					<Button
						size="sm"
						disabled={!mounted || isLoading || !hasMissing || isAnyInstalling}
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
				</div>
			</div>

			{/* Show skeleton placeholders while dependencies are loading */}
			{!mounted || isLoading ? (
				<DependenciesPageSkeleton />
			) : (
				<>
					{/* Status Overview Banner */}
					<div className="flex flex-wrap items-center justify-between gap-4 p-3.5 rounded-xl border border-sidebar-border bg-sidebar/50 text-xs">
						<div className="flex flex-wrap items-center gap-4">
							<div className="flex items-center gap-1.5 font-normal text-foreground">
								<CheckCircle2 className="w-4 h-4 text-chart-1 shrink-0" />
								<span>
									Installed:{" "}
									<span className="font-medium">{installedCount}/3</span>
								</span>
							</div>
							{hasMissing && (
								<div className="flex items-center gap-1.5 font-normal text-destructive">
									<ShieldAlert className="w-4 h-4 shrink-0" />
									<span>
										Missing:{" "}
										<span className="font-medium">
											{missingToolInfos.length}
										</span>
									</span>
								</div>
							)}
							<div className="flex items-center gap-1.5 font-normal text-foreground">
								<HardDrive className="w-4 h-4 text-primary shrink-0" />
								<span className="shrink-0">Used Storage:</span>
								<span className="font-mono text-primary font-medium">
									{formatSizeMb(appStorageMb)}
								</span>
							</div>
						</div>
						<div className="flex items-center gap-2 text-muted-foreground text-[11px] shrink-0">
							<span>Managed App Storage</span>
							<span className="opacity-40">•</span>
							<div className="flex items-center justify-center gap-1">
								<ShieldCheck className="w-4 h-4 text-chart-1" />
								<span className="text-chart-1">Verified SHA-256 Checksums</span>
							</div>
						</div>
					</div>

					{/* Dependencies List — sorted by priority */}
					<div className="grid grid-cols-1 gap-4">
						{sortedTools.map((tool) => (
							<ToolCard
								key={tool.key}
								tool={tool}
								info={depMap[tool.key]}
								installState={installStates[tool.key]}
								mounted={mounted}
								isLoading={isLoading}
								onInstallClick={handleRequestSingleConfirm}
								onUninstallClick={handleUninstallClick}
							/>
						))}
					</div>
				</>
			)}

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

			{/* Clear WebKit Cache Confirmation (Linux only) */}
			{isLinux && (
				<ClearWebKitCacheDialog
					open={showClearCacheConfirm}
					cacheSizeMb={webkitCacheMb}
					onClose={() => setShowClearCacheConfirm(false)}
					onConfirm={handleClearWebKitCache}
				/>
			)}

			{/* Dependencies Are Up to Date Alert Dialog */}
			<UpToDateDialog
				open={showUpToDateDialog}
				onClose={() => setShowUpToDateDialog(false)}
				tools={upToDateTools}
			/>
		</div>
	);
}
