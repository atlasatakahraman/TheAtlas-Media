// next@16.2.9 — verified against node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md on 2026-06-21
"use client";

import { Button } from "@/components/ui/button";
import { DependencyInstallDialog } from "@/components/dependency-dialogs";
import { Download, LucideMinus, LucideX, Maximize, Maximize2, Sparkles } from "lucide-react";

import { useWindow } from "@/hooks/use-window";
import { DependencyReport, PLATFORM } from "@/lib/types";
import { useMaximize } from "@/hooks/use-maximize";
import { getWin } from "@/hooks/get-window";
import { SidebarTrigger } from "@/components/ui/sidebar";
import useDependency from "@/hooks/use-dependency";
import { useInstall, type ToolInstallInfo } from "@/hooks/use-install";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { toast } from "sonner";
function formatToolName(name: string): string {
	const lower = name.toLowerCase();
	if (lower === "ffmpeg") return "FFmpeg";
	if (lower === "ffprobe") return "FFprobe";
	if (lower === "yt-dlp" || lower === "ytdlp") return "yt-dlp";
	return name;
}

const emptySubscribe = () => () => {};
function useIsMounted() {
	return useSyncExternalStore(
		emptySubscribe,
		() => true,
		() => false,
	);
}

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

/**
 * Evaluates dependencies in order:
 * 1. FIRST check: Is any dependency missing (status === "notInstalled")?
 *    Label: "Install yt-dlp" / "Install FFmpeg" / "Install Missing Dependencies".
 * 2. SECOND check: If all dependencies are installed, check if an update is available.
 *    Label: "yt-dlp Update Available".
 */
function getDependencyBadgeDetails(deps: DependencyReport): BadgeDetails {
	const missing: string[] = [];
	if (deps.ytdlp.status === "notInstalled") missing.push("yt-dlp");
	if (deps.ffmpeg.status === "notInstalled") missing.push("FFmpeg");
	if (deps.ffprobe.status === "notInstalled" && !missing.includes("FFmpeg")) missing.push("FFprobe");

	// Priority 1: Missing dependencies
	if (missing.length > 0) {
		const label = missing.length === 1 ? `Install ${missing[0]}` : `Install Missing Dependencies (${missing.join(", ")})`;
		return { show: true, label, actionLabel: "Install", isMissing: true, tools: missing };
	}

	// Priority 2: Installed dependencies — check if updates exist (deferred/cached)
	return { show: false, label: "", actionLabel: "Update", isMissing: false, tools: [] };
}

function getToolSpecificDescription(missingTools: string[], isMissing: boolean): string {
	if (!isMissing) {
		return "A new update is available. Click to update to the latest release.";
	}
	return "Some tools are not gonna accessible until it is installed.";
}

export default function Header() {
	const handleClose = () => getWin().close();
	const handleMinimize = () => getWin().minimize();
	const handleMaximize = () => getWin().toggleMaximize();

	const dependencies = useDependency();
	const mounted = useIsMounted();
	const windowState = useWindow();
	const isDragRegion = windowState.status === "loading" || windowState.caps.canSetPosition;

	const {
		confirmTarget,
		requestConfirm,
		requestConfirmAll,
		closeConfirm,
		confirmAndInstall,
	} = useInstall();

	const hasNotified = useRef(false);

	const badgeDetails = useMemo<BadgeDetails>(() => {
		if (dependencies.status === "loading") {
			return { show: false, label: "", actionLabel: "", isMissing: false, tools: [] };
		}
		return getDependencyBadgeDetails(dependencies.deps);
	}, [dependencies]);

	const handleActionClick = useCallback(() => {
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
			requestConfirm(t.name, t.currentVersion, t.targetVersion);
		} else {
			requestConfirmAll(toolsToInstall);
		}
	}, [badgeDetails.tools, dependencies, requestConfirm, requestConfirmAll]);

	// Trigger Sonner toast notification with tool-specific description listing disabled features
	useEffect(() => {
		if (dependencies.status === "loading" || hasNotified.current) return;

		if (badgeDetails.show) {
			hasNotified.current = true;

			toast.info(badgeDetails.label, {
				description: getToolSpecificDescription(badgeDetails.tools, badgeDetails.isMissing),
				action: {
					label: badgeDetails.actionLabel,
					onClick: () => handleActionClick(),
				},
			});
		}
	}, [dependencies, badgeDetails, handleActionClick]);

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
						{mounted && badgeDetails.show && (
							<Button
								variant="default"
								size="xs"
								onClick={handleActionClick}
								className="gap-1 cursor-pointer select-none shadow-xs duration-500 animate-in slide-in-from-top-9 fade-in-0 transition-[opacity,transform] ease-out"
							>
								{badgeDetails.isMissing ? (
									<Download className="w-3 h-3 text-primary-foreground" />
								) : (
									<Sparkles className="w-3 h-3 text-primary-foreground" />
								)}
								{badgeDetails.label}
							</Button>
						)}
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
