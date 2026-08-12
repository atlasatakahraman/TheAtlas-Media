// next@16.2.9 — verified against node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md on 2026-06-21
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DependencyInstallDialog } from "@/components/dependency-dialogs";
import { Download, LucideMinus, LucideX, Maximize, Maximize2, Sparkles } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";

import { useWindow } from "@/hooks/use-window";
import { DependencyInfo, DependencyReport, PLATFORM } from "@/lib/types";
import { useMaximize } from "@/hooks/use-maximize";
import { getWin } from "@/hooks/get-window";
import { SidebarTrigger } from "@/components/ui/sidebar";
import useDependency from "@/hooks/use-dependency";
import { useIsMounted } from "@/hooks/use-is-mounted";
import { useInstall, type ToolInstallInfo } from "@/hooks/use-install";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

interface ControlProps {
	onClose: () => void;
	onMinimize: () => void;
	onMaximize: () => void;
	canMaximize?: boolean;
	canMinimize?: boolean;
	loading?: boolean;
}

function MacOSControls({ onClose, onMinimize, onMaximize }: ControlProps) {
	const isMaximize = useMaximize();

	return (
		<>
			<Button onClick={onClose} variant={"ghost"}>
				<LucideX />
			</Button>
			<Button onClick={onMaximize} variant={"ghost"}>
				{isMaximize ? (
					<Maximize2 className="w-4 h-4"></Maximize2>
				) : (
					<Maximize className="w-4 h-4"></Maximize>
				)}
			</Button>
			<Button onClick={onMinimize} variant={"ghost"}>
				<LucideMinus />
			</Button>
		</>
	);
}

function DefaultControls({
	onClose,
	onMinimize,
	onMaximize,
	canMaximize,
	canMinimize,
	loading,
}: ControlProps) {
	const isMaximize = useMaximize();

	if (loading) return null;

	return (
		<div className="flex *:duration-500 *:animate-in *:slide-in-from-top-9 *:fade-in-0 *:transition-[opacity,transform] *:ease-out">
			<div>
				<Button onClick={onMinimize} hidden={!canMinimize} variant={"ghost"}>
					<LucideMinus />
				</Button>
			</div>
			<div>
				<Button
					onClick={onMaximize}

					hidden={!canMaximize}
					variant={"ghost"}
				>
					{isMaximize ? (
						<Maximize2 className="w-4 h-4"></Maximize2>
					) : (
						<Maximize className="w-4 h-4"></Maximize>
					)}
				</Button>
			</div>
			<div>
				<Button onClick={onClose} variant={"ghost"}>
					<LucideX />
				</Button>
			</div>
		</div>
	);
}

type BadgeDetails = {
	show: boolean;
	label: string;
	actionLabel: string;
	isMissing: boolean;
	tools: string[];
};

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

function hasUpdate(info: DependencyInfo): boolean {
	if (info.status !== "installed") return false;
	if (!info.version || !info.latestVersion) return false;
	const current = normalizeVersion(info.version);
	const latest = normalizeVersion(info.latestVersion);
	if (!latest || latest === "latest" || latest === "latest release") return false;
	return current !== latest;
}

/**
 * Evaluates dependencies in order:
 * 1. FIRST check: Is any dependency missing (status === "notInstalled")?
 *    Label: "Install yt-dlp" / "Install FFmpeg" / "Missing Dependencies".
 * 2. SECOND check: If all dependencies are installed, check if updates are available.
 *    Label: "Update Available" / "Updates Available".
 */
function getDependencyBadgeDetails(deps: DependencyReport): BadgeDetails {
	const missing: string[] = [];
	if (deps.ytdlp.status === "notInstalled") missing.push("yt-dlp");
	if (deps.ffmpeg.status === "notInstalled") missing.push("FFmpeg");
	if (deps.ffprobe.status === "notInstalled" && !missing.includes("FFmpeg"))
		missing.push("FFprobe");

	// Priority 1: Missing dependencies
	if (missing.length > 0) {
		const label =
			missing.length === 1
				? `Missing ${missing[0]}`
				: `Install Missing Dependencies (${missing.join(", ")})`;
		return { show: true, label, actionLabel: "Install", isMissing: true, tools: missing };
	}

	// Priority 2: Installed dependencies — check for updates
	const updates: string[] = [];
	if (deps.ytdlp.status === "installed" && hasUpdate(deps.ytdlp)) updates.push("yt-dlp");
	if (deps.ffmpeg.status === "installed" && hasUpdate(deps.ffmpeg)) updates.push("FFmpeg");
	if (deps.ffprobe.status === "installed" && hasUpdate(deps.ffprobe)) updates.push("FFprobe");

	if (updates.length > 0) {
		const label = updates.length === 1 ? `${updates[0]} Update Available` : "Updates Available";
		return { show: true, label, actionLabel: "Update", isMissing: false, tools: updates };
	}

	return { show: false, label: "", actionLabel: "Update", isMissing: false, tools: [] };
}

function getToolSpecificDescription(missingTools: string[], isMissing: boolean): string {
	if (!isMissing) {
		return "A new update is available. Click to update to the latest release.";
	}
	return "Some tools are not gonna accessible until it is installed.";
}

export default function Header() {
	const router = useRouter();
	const handleClose = useCallback(() => getWin().close(), []);
	const handleMinimize = useCallback(() => getWin().minimize(), []);
	const handleMaximize = useCallback(() => getWin().toggleMaximize(), []);

	const dependencies = useDependency();
	const mounted = useIsMounted();
	const windowState = useWindow();
	const isDragRegion = windowState.status === "loading" || windowState.caps.canSetPosition;

	const { confirmTarget, requestConfirm, requestConfirmAll, closeConfirm, confirmAndInstall } =
		useInstall();

	const hasNotified = useRef(false);

	const badgeDetails = useMemo<BadgeDetails>(() => {
		if (dependencies.status === "loading") {
			return { show: false, label: "", actionLabel: "", isMissing: false, tools: [] };
		}
		return getDependencyBadgeDetails(dependencies.deps);
	}, [dependencies]);

	const headerBadgeLabel = useMemo(() => {
		if (!badgeDetails.show) return "";
		if (badgeDetails.isMissing) return "Missing Dependencies";
		return badgeDetails.tools.length === 1 ? "Update Available" : "Updates Available";
	}, [badgeDetails]);

	const handleBadgeClick = useCallback(() => {
		router.push("/settings/dependencies");
	}, [router]);

	const handleToastInstallClick = useCallback(() => {
		if (dependencies.status === "loading") return;
		const { ffmpeg, ffprobe, ytdlp } = dependencies.deps;

		const toolsToInstall: ToolInstallInfo[] = badgeDetails.tools.map((t) => {
			const info = t === "yt-dlp" ? ytdlp : t === "ffmpeg" ? ffmpeg : ffprobe;
			return {
				name: t,
				currentVersion: info?.version ?? "Not Installed",
				targetVersion: info?.latestVersion ?? "Latest Release",
			};
		});

		if (toolsToInstall.length === 1) {
			const t = toolsToInstall[0];
			const title = badgeDetails.isMissing ? `Install ${t.name}?` : `Update ${t.name}?`;
			requestConfirm(t.name, t.currentVersion, t.targetVersion, title);
		} else {
			const title = badgeDetails.isMissing
				? "Install All Missing Dependencies"
				: "Install All Updates";
			requestConfirmAll(toolsToInstall, title);
		}
	}, [badgeDetails.isMissing, badgeDetails.tools, dependencies, requestConfirm, requestConfirmAll]);

	// Trigger Sonner toast notification (restored exact original text and dialog action)
	useEffect(() => {
		if (dependencies.status === "loading" || hasNotified.current) return;

		if (badgeDetails.show) {
			hasNotified.current = true;

			toast.info(badgeDetails.label, {
				description: getToolSpecificDescription(badgeDetails.tools, badgeDetails.isMissing),
				action: {
					label: badgeDetails.actionLabel,
					onClick: () => handleToastInstallClick(),
				},
			});
		}
	}, [dependencies, badgeDetails, handleToastInstallClick]);

	return (
		<>
			<div
				className="flex-1 bg-secondary flex w-full min-h-16 max-h-16 select-none"
				data-tauri-drag-region={isDragRegion}
			>
				<div
					className="sticky flex-1 flex items-center text-sm px-2 select-none border-b border-sidebar-border"
					data-tauri-drag-region={isDragRegion}
				>
					<div
						className="flex-1 flex justify-start items-center gap-2 duration-500 animate-in slide-in-from-top-9 fade-in-0 transition-[opacity,transform] ease-out"
						data-tauri-drag-region
					>
						<div className="md:hidden">
							<SidebarTrigger />
						</div>
						<div className="duration-500 animate-in slide-in-from-top-9 fade-in-0 transition-[opacity,transform] ease-out">
							<ThemeToggle />
						</div>
						{mounted && dependencies.status === "ready" && badgeDetails.show ? (
							<Button
								variant={badgeDetails.isMissing ? "destructive" : "default"}
								size="xs"
								onClick={handleBadgeClick}
								className="gap-1 rounded-full px-2.5 cursor-pointer select-none shadow-xs duration-500 animate-in slide-in-from-top-9 fade-in-0 transition-[opacity,transform] ease-out"
							>
								{badgeDetails.isMissing ? (
									<Download className="w-3 h-3" />
								) : (
									<Sparkles className="w-3 h-3" />
								)}
								{headerBadgeLabel}
							</Button>
						) : null}
					</div>
					<div className="flex-1 flex justify-end" data-tauri-drag-region>
						{PLATFORM === "macos" ? (
							<MacOSControls
								onClose={handleClose}
								onMinimize={handleMinimize}
								onMaximize={handleMaximize}
							/>
						) : (
							<DefaultControls
								onClose={handleClose}
								onMinimize={handleMinimize}
								onMaximize={handleMaximize}
								canMaximize={
									windowState.status === "loading" || windowState.caps.canMaximize
								}
								canMinimize={
									windowState.status === "loading" || windowState.caps.canMinimize
								}
								loading={windowState.status === "loading"}
							/>
						)}
					</div>
				</div>
			</div>

			{/* Confirm Download & Install AlertDialog */}
			<DependencyInstallDialog
				confirmTarget={confirmTarget}
				onClose={closeConfirm}
				onConfirm={confirmAndInstall}
			/>
		</>
	);
}
