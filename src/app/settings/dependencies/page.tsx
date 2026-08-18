// next@16.2.9 — verified against node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md on 2026-06-21
"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
	ClearWebKitCacheDialog,
	DependencyInstallDialog,
	DependencyPathDialog,
	DependencyUninstallDialog,
	UpToDateDialog,
	type ToolChecksumInfo,
} from "@/components/dependency-dialogs";
import { DependenciesPageSkeleton } from "@/components/dependency-skeletons";
import useDependency from "@/hooks/use-dependency";
import { useIsMounted } from "@/hooks/use-is-mounted";
import { useInstall, InstallStatus, type ToolInstallInfo } from "@/hooks/use-install";
import { DependencyInfo } from "@/lib/types";
import {
	clear_webkit_cache,
	get_app_storage_size_mb,
	get_webkit_cache_size_mb,
	open_app_storage_dir,
	reveal_dependency_path,
} from "@/lib/dependency-env";
import { formatSourceLabel, formatToolName } from "@/lib/tool-names";
import { cn, formatSizeMb, formatSizeBytes } from "@/lib/utils";
import { formatVersionDisplay } from "@/lib/version";
import {
	Building2,
	Check,
	CheckCircle2,
	Copy,
	Download,
	ExternalLink,
	FolderOpen,
	HardDrive,
	Info,
	Loader2,
	Package,
	RefreshCw,
	Route,
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
		case "checkingManifest":
			return "Checking manifest";
		case "downloading":
			return "Downloading";
		case "extracting":
			return "Extracting";
		case "verifying":
			return "Verifying";
		case "installed":
			return "Installed";
		case "failed":
			return "Failed";
		default:
			return status;
	}
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

interface ToolCardProps {
	tool: ToolConfig;
	info: DependencyInfo | undefined;
	installState: { status: InstallStatus; progress: number; message: string } | undefined;
	mounted: boolean;
	isLoading: boolean;
	isUninstalling?: boolean;
	isRevealingPath?: boolean;
	onInstallClick: (key: string) => void;
	onUninstallClick: (key: string) => void;
	onInstallManagedClick: (key: string) => void;
	onRevealPath: (path: string) => void;
	onChangePathClick: (key: string) => void;
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
	isUninstalling,
	isRevealingPath,
	onInstallClick,
	onUninstallClick,
	onInstallManagedClick,
	onRevealPath,
	onChangePathClick,
}: ToolCardProps) {
	const [copiedSha, setCopiedSha] = useState(false);
	const isInstalling = isActiveInstall(installState?.status);
	const Icon = tool.icon;
	// The backend dependency report is the single source of truth — a
	// leftover `installState.status === "installed"` from earlier in the
	// session must never override it, or the card keeps claiming "installed"
	// after an uninstall until the page is reloaded. `installState` is only
	// used below for the progress panel and the failure alert.
	const isInstalled = mounted && !isLoading && !isUninstalling && info?.status === "installed";
	const isManaged = isInstalled && info?.source === "managed";
	const isExternal = isInstalled && !isManaged;
	// Only possible when source === "env": env resolution outranks managed,
	// so a working managed copy under a "path" source would already have
	// been resolved as "managed" instead.
	const isShadowingManaged = isExternal && info?.source === "env" && info?.managedInstalled;
	// Two distinct detected installations (e.g. an env override shadowing a
	// managed copy underneath it) — the user should always be able to jump
	// straight to picking between them, regardless of which action buttons
	// the current state otherwise shows.
	const hasTwoPaths = Boolean(
		isInstalled && info?.managedPath && info?.path && info.managedPath !== info.path,
	);

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
		<Card
			className={cn(
				"bg-sidebar border-sidebar-border shadow-xs transition-colors py-0 rounded-2xl",
				!isInstalled && "border-chart-5 border-2",
			)}
		>
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
								) : isUninstalling ? (
									<Badge variant="outline" className="text-xs rounded-full">
										<Loader2 className="w-3 h-3 animate-spin mr-1" /> Uninstalling…
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
						) : isUninstalling ? (
							<Button size="sm" variant="ghost" disabled className="gap-1.5 text-xs rounded-md font-medium">
								<Loader2 className="w-3.5 h-3.5 animate-spin" />
								Uninstalling…
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
									className="gap-1.5 text-xs rounded-md font-medium group"
								>
									<Trash2 className="w-3.5 h-3.5 transition-transform duration-200 ease-out group-hover:scale-115" />
									Uninstall
								</Button>
							</>
						) : !isInstalled ? (
							/* Not installed — show Install button */
							<Button
								size="sm"
								variant="default"
								disabled={!mounted}
								onClick={() => onInstallClick(tool.key)}
								className="gap-1.5 text-xs rounded-md font-medium group"
							>
								<Download className="w-3.5 h-3.5 transition-transform duration-200 ease-out group-hover:scale-105 group-hover:translate-y-[1px]" />
								Install
							</Button>
						) : isShadowingManaged ? (
							/* Env override active AND a managed copy exists underneath it —
							   the managed copy is being shadowed; offer to remove it. */
							<Button
								size="sm"
								variant="destructive"
								disabled={!mounted}
								onClick={() => onUninstallClick(tool.key)}
								className="gap-1.5 text-xs rounded-md font-medium group"
							>
								<Trash2 className="w-3.5 h-3.5 transition-transform duration-200 ease-out group-hover:scale-115" />
								Uninstall Managed Copy
							</Button>
						) : isExternal && !info?.managedPath ? (
							/* External (env/PATH) install with no managed copy detected —
							   never auto-updated. Offer to install a managed copy that
							   TheAtlas will own and update. If a managed path already
							   exists (shadowed or otherwise), skip this — "Change Path"
							   already lets the user pick it. */
							<Button
								size="sm"
								variant="outline"
								disabled={!mounted}
								onClick={() => onInstallManagedClick(tool.key)}
								className="gap-1.5 text-xs rounded-md font-medium group"
							>
								<Download className="w-3.5 h-3.5 transition-transform duration-200 ease-out group-hover:scale-105 group-hover:translate-y-[1px]" />
								Install Managed Copy
							</Button>
						) : null}
						{/* Two installations detected — always offer a direct way to
						   switch between them, alongside whichever action(s) above. */}
						{!isInstalling && hasTwoPaths && (
							<Button
								size="sm"
								variant="outline"
								disabled={!mounted}
								onClick={() => onChangePathClick(tool.key)}
								className="gap-1.5 text-xs rounded-md font-medium"
							>
								<Route className="w-3.5 h-3.5" />
								Change Path
							</Button>
						)}
					</div>
				</div>

				{/* External-install notice — never shown for managed or missing tools */}
				{isExternal && (
					<div className="rounded-xl border border-sidebar-border/60 bg-sidebar/60 p-3 flex items-start gap-2.5 text-xs text-muted-foreground">
						<Info className="w-4 h-4 shrink-0 mt-0.5 text-primary/70" />
						<p>
							{isShadowingManaged ? (
								<>
									A <code className="font-mono text-[11px]">THEATLAS_*_PATH</code> override is
									active, shadowing the managed copy at{" "}
									<span className="font-mono text-[11px] break-all">
										{info?.managedPath}
									</span>
									.
								</>
							) : (
								<>
									Using your own installation — TheAtlas will not update it. Install a
									managed copy to get automatic update checks.
								</>
							)}
						</p>
					</div>
				)}

				{/* Progress Panel (when installing) */}
				{isInstalling &&
					installState &&
					(() => {
						const isDownloading = installState.status === "downloading";
						const pct = Math.min(100, Math.max(0, installState.progress));

						return (
							<div className="rounded-xl border border-sidebar-border/60 bg-sidebar/60 p-3 space-y-2.5">
								{/* Status + percentage row */}
								<div className="flex items-center justify-between gap-2 min-w-0">
									<div className="flex items-center gap-1.5 min-w-0">
										<Loader2 className="w-3 h-3 animate-spin shrink-0 text-primary" />
										<span className="text-xs font-medium text-foreground">
											{installStatusLabel(
												installState.status as InstallStatus,
											)}
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
								{installState.message ||
									"An unknown error occurred during installation."}
							</p>
						</div>
					</div>
				)}

				<Separator className="bg-sidebar-border/60" />
				<TooltipProvider>
					<div className="divide-y divide-sidebar-border/30">
						{/* ── If installed: show dynamic fields first (most important) ── */}
						{isInstalled && info && (() => {
							const sourceRow = (
								<MetaRow key="source" icon={HardDrive} label="Source">
									<span
										className={cn(
											"inline-block font-mono text-[11px] px-2 py-0.5 rounded-md border",
											info.source === "managed"
												? "bg-chart-1/10 border-chart-1/30 text-chart-1"
												: "bg-background/50 border-sidebar-border/50 text-muted-foreground",
										)}
									>
										{formatSourceLabel(info.source)}
									</span>
								</MetaRow>
							);

							const pathRow = (
								<MetaRow key="path" icon={Terminal} label="Path">
									<div className="flex items-start gap-1.5 flex-wrap">
										{info.path ? (
											<Tooltip>
												<TooltipTrigger asChild>
													<button
														onClick={() => onRevealPath(info.path!)}
														className="inline-flex items-start gap-1.5 font-mono text-[11px] bg-background/50 px-2 py-0.5 rounded-md border border-sidebar-border/50 text-muted-foreground cursor-pointer hover:bg-background transition-colors break-all text-left max-w-full"
													>
														{isRevealingPath ? (
															<Loader2 className="w-3 h-3 shrink-0 text-primary animate-spin mt-0.5" />
														) : (
															<FolderOpen className="w-3 h-3 shrink-0 text-primary/60 mt-0.5" />
														)}
														{info.path}
													</button>
												</TooltipTrigger>
												<TooltipContent side="top">Reveal in file manager</TooltipContent>
											</Tooltip>
										) : (
											<span className="inline-block font-mono text-[11px] bg-background/50 px-2 py-0.5 rounded-md border border-sidebar-border/50 break-all text-muted-foreground">
												N/A
											</span>
										)}
										{info.path && (
											<Tooltip>
												<TooltipTrigger asChild>
													<button
														onClick={() => onChangePathClick(tool.key)}
														className="inline-flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded-md border border-sidebar-border/50 text-primary hover:bg-background transition-colors cursor-pointer shrink-0 group/change-btn"
													>
														<Route className="w-3 h-3 transition-transform duration-200 ease-out group-hover/change-btn:scale-115" />
														Change
													</button>
												</TooltipTrigger>
												<TooltipContent side="top">
													Pick a different installation to use
												</TooltipContent>
											</Tooltip>
										)}
									</div>
								</MetaRow>
							);

							return (
								<>
									{/* 0. Path — always first, matching the yt-dlp reference layout */}
									{pathRow}

									{/* 1. Version */}
									{info.version && (
										<MetaRow icon={Info} label="Version">
											<span className="inline-block font-mono text-[11px] bg-background/50 px-2 py-0.5 rounded-md border border-sidebar-border/50 break-all leading-relaxed text-muted-foreground">
												{formatVersionDisplay(info.version)}
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
															setCopiedSha(true);
															setTimeout(() => setCopiedSha(false), 2000);
															toast.success(`Copied ${tool.name} SHA-256 checksum`);
														}}
														className="inline-flex items-start gap-1.5 font-mono text-[11px] bg-background/50 px-2 py-0.5 rounded-md border border-sidebar-border/50 text-muted-foreground cursor-pointer hover:bg-background transition-colors break-all text-left max-w-full"
													>
														{copiedSha ? (
															<Check className="w-3 h-3 shrink-0 text-chart-1 mt-0.5" />
														) : (
															<Copy className="w-3 h-3 shrink-0 text-primary/60 mt-0.5" />
														)}
														{info.sha256}
													</button>
												</TooltipTrigger>
												<TooltipContent side="top">Click to copy checksum</TooltipContent>
											</Tooltip>
										</MetaRow>
									)}

									{/* 3. Binary Size — prefer exact sizeBytes, fall back to sizeMb */}
									{(info.sizeBytes != null && info.sizeBytes > 0) || (info.sizeMb && info.sizeMb > 0) ? (
										<MetaRow icon={HardDrive} label="Binary Size">
											<span className="inline-block font-mono text-[11px] bg-background/50 px-2 py-0.5 rounded-md border border-sidebar-border/50 text-muted-foreground">
												{info.sizeBytes != null && info.sizeBytes > 0
													? formatSizeBytes(info.sizeBytes)
													: formatSizeMb(info.sizeMb)}
											</span>
										</MetaRow>
									) : null}

									{/* 4. Source — always after Path, matching the yt-dlp reference layout */}
									{sourceRow}
								</>
							);
						})()}

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
		clearState,
		checkForUpdates,
		confirmTarget,
		closeConfirm,
		confirmAndInstall,
	} = useInstall();

	const [uninstallTarget, setUninstallTarget] = useState<string | null>(null);
	const [pathDialogTarget, setPathDialogTarget] = useState<string | null>(null);
	const [appStorageMb, setAppStorageMb] = useState<number | null>(null);
	const [webviewCacheMb, setWebviewCacheMb] = useState<number | null>(null);
	const [isClearingCache, setIsClearingCache] = useState(false);
	const [showClearCacheConfirm, setShowClearCacheConfirm] = useState(false);
	const [showUpToDateDialog, setShowUpToDateDialog] = useState(false);
	const [upToDateTools, setUpToDateTools] = useState<ToolChecksumInfo[]>([]);

	const updateCacheSize = useCallback(() => {
		get_webkit_cache_size_mb()
			.then(setWebviewCacheMb)
			.catch(() => setWebviewCacheMb(null));
	}, []);

	useEffect(() => {
		updateCacheSize();
	}, [updateCacheSize]);

	const updateStorageSize = useCallback(() => {
		get_app_storage_size_mb()
			.then(setAppStorageMb)
			.catch(() => setAppStorageMb(null));
	}, []);

	const handleClearCache = useCallback(async () => {
		setShowClearCacheConfirm(false);
		setIsClearingCache(true);
		try {
			const cleared = await clear_webkit_cache();
			const label = cleared > 0 ? ` (${formatSizeMb(cleared)} freed)` : "";
			toast.success(`Cache cleared${label}`);
			setWebviewCacheMb(0);
			updateStorageSize();
		} catch (e) {
			toast.error("Failed to clear cache: " + String(e));
		} finally {
			setIsClearingCache(false);
		}
	}, [updateStorageSize]);

	const isOpeningStorageDirRef = useRef(false);
	const [isOpeningStorageDir, setIsOpeningStorageDir] = useState(false);
	const handleOpenStorageDir = useCallback(async (e?: React.MouseEvent) => {
		if (e) {
			e.stopPropagation();
			e.preventDefault();
		}
		if (isOpeningStorageDirRef.current) return;
		isOpeningStorageDirRef.current = true;
		setIsOpeningStorageDir(true);
		try {
			const path = await open_app_storage_dir();
			toast.success("Opened managed storage folder", { description: path });
		} catch (err) {
			toast.error(`Failed to open storage folder: ${String(err)}`);
		} finally {
			isOpeningStorageDirRef.current = false;
			setIsOpeningStorageDir(false);
		}
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

	// Storage banner label — reflects where the *installed* dependencies
	// actually live: all system/env paths, all TheAtlas-managed, or a mix.
	const storageLabel = useMemo(() => {
		if (dependencies.status === "loading") return "Managed App Storage";
		const { ffmpeg, ffprobe, ytdlp } = dependencies.deps;
		const installed = [ffmpeg, ffprobe, ytdlp].filter((d) => d.status === "installed");
		if (installed.length === 0) return "Managed App Storage";
		const hasManaged = installed.some((d) => d.source === "managed");
		const hasSystem = installed.some((d) => d.source !== "managed");
		const hasShadowedManaged = [ffmpeg, ffprobe, ytdlp].some(
			(d) => d.managedPath && d.path && d.managedPath !== d.path,
		);
		if (hasManaged && hasSystem) return "Mixed App/System Storage";
		if (hasShadowedManaged) return "System Path (Managed Present)";
		if (hasSystem) return "System Path Storage";
		return "Managed App Storage";
	}, [dependencies]);

	// A dependency with two distinct detected paths (env override shadowing a
	// managed copy underneath it) means managed storage is in play regardless
	// of which path currently wins — never collapse the label to "Used Cache".
	const hasAnyTwoPaths = useMemo(() => {
		if (dependencies.status === "loading") return false;
		const { ffmpeg, ffprobe, ytdlp } = dependencies.deps;
		return [ffmpeg, ffprobe, ytdlp].some(
			(d) => d.managedPath && d.path && d.managedPath !== d.path,
		);
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
		if (ffprobe.status === "notInstalled") {
			items.push({
				name: "ffprobe",
				currentVersion: ffprobe.version ?? "Not Installed",
				targetVersion: ffprobe.latestVersion ?? "Latest Release",
			});
		}
		return items;
	}, [dependencies]);

	const unmanagedToolInfos = useMemo<ToolInstallInfo[]>(() => {
		if (dependencies.status === "loading") return [];
		const { ytdlp, ffmpeg, ffprobe } = dependencies.deps;
		const items: ToolInstallInfo[] = [];
		if (!ytdlp.managedInstalled) {
			items.push({
				name: "yt-dlp",
				currentVersion: ytdlp.managedVersion ?? ytdlp.version ?? "Not Installed",
				targetVersion: ytdlp.latestVersion ?? "Latest Release",
			});
		}
		if (!ffmpeg.managedInstalled) {
			items.push({
				name: "ffmpeg",
				currentVersion: ffmpeg.managedVersion ?? ffmpeg.version ?? "Not Installed",
				targetVersion: ffmpeg.latestVersion ?? "Latest Release",
			});
		}
		if (!ffprobe.managedInstalled) {
			items.push({
				name: "ffprobe",
				currentVersion: ffprobe.managedVersion ?? ffprobe.version ?? "Not Installed",
				targetVersion: ffprobe.latestVersion ?? "Latest Release",
			});
		}
		return items;
	}, [dependencies]);

	const allManagedInstalled = useMemo(() => {
		if (dependencies.status === "loading") return false;
		const { ytdlp, ffmpeg, ffprobe } = dependencies.deps;
		return Boolean(ytdlp.managedInstalled && ffmpeg.managedInstalled && ffprobe.managedInstalled);
	}, [dependencies]);

	const hasMissing = useMemo(() => {
		if (dependencies.status === "loading") return false;
		return !dependencies.deps.allInstalled;
	}, [dependencies]);

	// Sort: two detected paths first → missing → update available → managed installed → system installed
	const sortedTools = useMemo(() => {
		const priority = (key: string): number => {
			const info = depMap[key];
			if (!info) return 1;
			// A shadowed managed copy (env override + managed path both present)
			// is the most actionable state — surface it above everything else.
			if (info.managedPath && info.path && info.managedPath !== info.path) return 0;
			if (info.status === "notInstalled") return 1;
			if (info.updateAvailable) return 2;
			if (info.source === "managed") return 3;
			return 4;
		};
		return [...TOOLS_CONFIG].sort((a, b) => priority(a.key) - priority(b.key));
	}, [depMap]);

	const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
	const [isCheckingPaths, setIsCheckingPaths] = useState(false);
	const [uninstallingKeys, setUninstallingKeys] = useState<Set<string>>(new Set());
	const [revealingPaths, setRevealingPaths] = useState<Set<string>>(new Set());

	const isAnyInstalling = useMemo(() => {
		return Object.values(installStates).some((s) => isActiveInstall(s?.status));
	}, [installStates]);

	const handleInstallAllManagedClick = useCallback(() => {
		if (isCheckingUpdates || isCheckingPaths) {
			toast.warning("Check is currently in progress. Please wait until it completes.");
			return;
		}

		const allManagedTools: ToolInstallInfo[] = [
			{
				name: "yt-dlp",
				currentVersion: depMap.ytdlp?.managedVersion ?? depMap.ytdlp?.version ?? "Not Installed",
				targetVersion: depMap.ytdlp?.latestVersion ?? "Latest Release",
			},
			{
				name: "ffmpeg",
				currentVersion: depMap.ffmpeg?.managedVersion ?? depMap.ffmpeg?.version ?? "Not Installed",
				targetVersion: depMap.ffmpeg?.latestVersion ?? "Latest Release",
			},
			{
				name: "ffprobe",
				currentVersion: depMap.ffprobe?.managedVersion ?? depMap.ffprobe?.version ?? "Not Installed",
				targetVersion: depMap.ffprobe?.latestVersion ?? "Latest Release",
			},
		];

		const toolsToInstall = unmanagedToolInfos.length > 0 ? unmanagedToolInfos : allManagedTools;
		const title = unmanagedToolInfos.length > 0
			? "Install Managed Dependencies"
			: "Reinstall All Managed Dependencies";

		requestConfirmAll(toolsToInstall, title);
	}, [depMap, isCheckingPaths, isCheckingUpdates, requestConfirmAll, unmanagedToolInfos]);

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

	// External (env/PATH) install — offer a managed copy alongside it rather
	// than "updating" a binary the app doesn't own. Framed as a fresh install,
	// not an update, regardless of the external binary's current version.
	const handleRequestManagedCopy = useCallback(
		(key: string) => {
			requestConfirm(
				key,
				"Not Installed",
				"Latest Release",
				`Install managed copy of ${formatToolName(key)}?`,
			);
		},
		[requestConfirm],
	);

	const revealingPathsRef = useRef<Set<string>>(new Set());
	const handleRevealPath = useCallback((path: string, e?: React.MouseEvent) => {
		if (e) {
			e.stopPropagation();
			e.preventDefault();
		}
		if (revealingPathsRef.current.has(path)) return;
		revealingPathsRef.current.add(path);
		setRevealingPaths((prev) => new Set([...prev, path]));
		reveal_dependency_path(path)
			.catch((err) => {
				toast.error(`Failed to reveal path: ${String(err)}`);
			})
			.finally(() => {
				revealingPathsRef.current.delete(path);
				setRevealingPaths((prev) => {
					const next = new Set(prev);
					next.delete(path);
					return next;
				});
			});
	}, []);

	const handleChangePathClick = useCallback((key: string) => {
		setPathDialogTarget(key);
	}, []);

	const handlePathChanged = useCallback(() => {
		dependencies.recheck();
		updateStorageSize();
		toast.success("Dependency path updated");
	}, [dependencies, updateStorageSize]);

	const handleCheckUpdates = useCallback(async () => {
		setIsCheckingUpdates(true);
		try {
			await checkForUpdates(true);
			const report = await dependencies.recheck();

			const toolsToUpdate: ToolInstallInfo[] = [];
			const verifiedTools: ToolChecksumInfo[] = [];

			if (report) {
				const checkTool = (info: DependencyInfo) => {
					// Skip missing dependencies when checking for updates
					if (info.status !== "installed") {
						return;
					}

					// Verify SHA-256 for all installed dependencies (managed, env, path, custom)
					if (info.sha256) {
						verifiedTools.push({
							name: info.name,
							version: info.version ?? "Installed",
							sha256: info.sha256,
						});
					}

					// Only managed dependencies are checked and offered for upstream updates
					const isManaged = info.source === "managed";
					const hasUpdate = isManaged && info.updateAvailable;

					if (hasUpdate) {
						toolsToUpdate.push({
							name: info.name,
							currentVersion: info.version ?? "Installed",
							targetVersion: info.latestVersion ?? "Latest Release",
						});
					}
				};

				checkTool(report.ytdlp);
				checkTool(report.ffmpeg);
				checkTool(report.ffprobe);
			}

			if (toolsToUpdate.length > 0) {
				const title =
					toolsToUpdate.length === 1
						? `Update ${toolsToUpdate[0].name}?`
						: "Install All Updates";
				requestConfirmAll(toolsToUpdate, title);
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

	const handleCheckPaths = useCallback(async () => {
		if (isCheckingPaths || isAnyInstalling) return;
		setIsCheckingPaths(true);
		try {
			const report = await dependencies.checkPaths();
			updateStorageSize();
			if (report) {
				const installedCount = [report.ffmpeg, report.ffprobe, report.ytdlp].filter(
					(d) => d.status === "installed",
				).length;
				if (report.allInstalled) {
					toast.success("All dependency paths checked and verified (3/3 installed)");
				} else {
					toast.info(
						`Dependency paths checked (${installedCount}/3 installed, ${3 - installedCount} missing)`,
					);
				}
			}
		} catch (e) {
			toast.error("Failed to check dependency paths: " + String(e));
		} finally {
			setIsCheckingPaths(false);
		}
	}, [dependencies, isAnyInstalling, isCheckingPaths, updateStorageSize]);

	const handleUninstallConfirm = useCallback(async () => {
		if (!uninstallTarget) return;
		const name = uninstallTarget;
		setUninstallTarget(null);

		setUninstallingKeys((prev) => new Set([...prev, name]));

		try {
			const ok = await uninstall(name);
			if (!ok) return;

			clearState(name);
			await dependencies.recheck();
			updateStorageSize();
			toast.success(`${formatToolName(name)} uninstalled`);
		} finally {
			setUninstallingKeys((prev) => {
				const next = new Set(prev);
				next.delete(name);
				return next;
			});
		}
	}, [uninstallTarget, uninstall, clearState, dependencies, updateStorageSize]);

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
					<Button
						variant={webviewCacheMb !== null && webviewCacheMb >= 70 ? "destructive" : "outline"}
						size="sm"
						disabled={isClearingCache || !(webviewCacheMb !== null && webviewCacheMb >= 70)}
						onClick={() => setShowClearCacheConfirm(true)}
						title={
							webviewCacheMb !== null && webviewCacheMb < 70
								? `Requires ≥ 70 MiB to clear (current: ${formatSizeMb(webviewCacheMb)})`
								: undefined
						}
						className="gap-1.5 rounded-md text-xs font-medium"
					>
						{isClearingCache ? (
							<Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
						) : (
							<Trash2 className="w-3.5 h-3.5" />
						)}
						Clear Cache
						{webviewCacheMb !== null && webviewCacheMb > 0.01 && (
							<span className="text-muted-foreground font-normal">
								({formatSizeMb(webviewCacheMb)})
							</span>
						)}
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={isCheckingPaths || isCheckingUpdates || isAnyInstalling}
						onClick={handleCheckPaths}
						title="Manually re-scan all dependency paths across the system"
						className="gap-1.5 border-border rounded-md text-xs font-medium group/check-paths"
					>
						{isCheckingPaths ? (
							<Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
						) : (
							<Route className="w-3.5 h-3.5 transition-transform duration-300 ease-out group-hover/check-paths:scale-115" />
						)}
						Check Paths
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={isCheckingPaths || isCheckingUpdates || isAnyInstalling}
						onClick={handleCheckUpdates}
						className="gap-1.5 border-border rounded-md text-xs font-medium"
					>
						{isCheckingUpdates ? (
							<Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
						) : (
							<RefreshCw className="w-3.5 h-3.5 transition-transform duration-500 ease-in-out group-hover/button:rotate-180 group-active/button:rotate-360" />
						)}
						Check Tools
					</Button>
					<Button
						size="sm"
						disabled={!mounted || isLoading || isAnyInstalling}
						onClick={handleInstallAllManagedClick}
						title="Download and install official managed binaries for all dependencies"
						className="gap-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium group"
					>
						{isAnyInstalling ? (
							<>
								<Loader2 className="w-3.5 h-3.5 animate-spin" />
								Installing…
							</>
						) : (
							<>
								<Download className="w-3.5 h-3.5 transition-transform duration-200 ease-out group-hover:scale-105 group-hover:translate-y-[1px]" />
								{allManagedInstalled ? "Reinstall All Managed" : "Install All Managed"}
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
								<span className="shrink-0">
									{storageLabel === "System Path Storage" && !hasAnyTwoPaths
										? "Used Cache:"
										: "Used Storage:"}
								</span>
								<span className="font-mono text-primary font-medium">
									{formatSizeMb(appStorageMb)}
								</span>
								<Button
									variant="ghost"
									size="xs"
									disabled={isOpeningStorageDir}
									onClick={handleOpenStorageDir}
									className="h-auto gap-1 px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground rounded-md"
								>
									{isOpeningStorageDir ? (
										<Loader2 className="w-3 h-3 animate-spin" />
									) : (
										<FolderOpen className="w-3 h-3" />
									)}
									Open Folder
								</Button>
							</div>
						</div>
						<div className="flex items-center gap-2 text-muted-foreground text-[11px] shrink-0">
							<span>{storageLabel}</span>
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
								isUninstalling={uninstallingKeys.has(tool.key)}
								isRevealingPath={Boolean(
									depMap[tool.key]?.path && revealingPaths.has(depMap[tool.key]!.path!),
								)}
								onInstallClick={handleRequestSingleConfirm}
								onUninstallClick={handleUninstallClick}
								onInstallManagedClick={handleRequestManagedCopy}
								onRevealPath={handleRevealPath}
								onChangePathClick={handleChangePathClick}
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

			{/* Clear WebView Cache Confirmation Dialog */}
			<ClearWebKitCacheDialog
				open={showClearCacheConfirm}
				cacheSizeMb={webviewCacheMb}
				onClose={() => setShowClearCacheConfirm(false)}
				onConfirm={handleClearCache}
			/>

			{/* Dependencies Are Up to Date Alert Dialog */}
			<UpToDateDialog
				open={showUpToDateDialog}
				onClose={() => setShowUpToDateDialog(false)}
				tools={upToDateTools}
			/>

			{/* Change Path picker */}
			<DependencyPathDialog
				toolKey={pathDialogTarget}
				currentPath={pathDialogTarget ? (depMap[pathDialogTarget]?.path ?? null) : null}
				onClose={() => setPathDialogTarget(null)}
				onChanged={handlePathChanged}
			/>
		</div>
	);
}
