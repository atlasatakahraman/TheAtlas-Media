// next@16.2.9 — verified against node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md on 2026-06-21
"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { Download, Loader2, LucideMinus, LucideX, Maximize, Maximize2 } from "lucide-react";

import { useWindow } from "@/hooks/use-window";
import { DependencyInfo, PLATFORM } from "@/lib/types";
import { useMaximize } from "@/hooks/use-maximize";
import { getWin } from "@/hooks/get-window";
import { SidebarTrigger } from "@/components/ui/sidebar";
import useDependency from "@/hooks/use-dependency";
import { useInstall, InstallStatus } from "@/hooks/use-install";
import { useCallback, useEffect, useMemo, useRef } from "react";

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
		<div className="flex *:duration-500 *:animate-in *:slide-in-from-top-9 *:fade-in-0 *:transition-all *:ease-out">
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

/** Returns true when the install is actively in progress. */
function isActiveInstall(status: InstallStatus | undefined): boolean {
	return status === "downloading" || status === "extracting" || status === "verifying";
}

export default function Header() {
	const handleClose = () => getWin().close();
	const handleMinimize = () => getWin().minimize();
	const handleMaximize = () => getWin().toggleMaximize();

	const dependencies = useDependency();
	const { states: installStates, install } = useInstall();

	// Derive missing deps directly — no effect + setState needed.
	const missingDeps = useMemo<DependencyInfo[]>(() => {
		if (dependencies.status === "loading") return [];

		const list: DependencyInfo[] = [];
		const { ffmpeg, ffprobe, ytdlp } = dependencies.deps;

		if (ffmpeg.status === "notInstalled") list.push(ffmpeg);
		if (ffprobe.status === "notInstalled") list.push(ffprobe);
		if (ytdlp.status === "notInstalled") list.push(ytdlp);

		return list;
	}, [dependencies]);

	// Re-check dependencies when any install completes.
	const prevInstalledRef = useRef(false);
	useEffect(() => {
		const anyInstalled = Object.values(installStates).some((s) => s.status === "installed");
		// Only recheck on transition to "at least one installed".
		if (anyInstalled && !prevInstalledRef.current) {
			prevInstalledRef.current = true;
			dependencies.recheck();
		} else if (!anyInstalled) {
			prevInstalledRef.current = false;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [installStates]);

	const handleInstall = useCallback(
		(name: string) => {
			const state = installStates[name];
			// Prevent re-triggering while already installing.
			if (state && isActiveInstall(state.status)) return;
			install(name);
		},
		[install, installStates],
	);

	const windowState = useWindow();
	const isDragRegion = windowState.status === "loading" || windowState.caps.canSetPosition;

	return (
		<div
			className="flex-1 bg-secondary flex w-full min-h-16  max-h-16 select-none"
			data-tauri-drag-region={isDragRegion}
		>
			<div
				className="sticky flex-1 flex items-center text-sm px-2 select-none border-b border-sidebar-border"
				data-tauri-drag-region={isDragRegion}
			>
				<div
					className="flex-1 flex justify-start md:hidden duration-500 animate-in slide-in-from-left-9 fade-in-0 transition-[opacity,transform] ease-out"
					data-tauri-drag-region
				>
					<SidebarTrigger></SidebarTrigger>
				</div>
				{dependencies.status !== "loading" && missingDeps.length > 0 && (
					<div
						className="flex-1 flex gap-1.5 items-center justify-start duration-500 animate-in slide-in-from-left-9 fade-in-0 transition-[opacity,transform] ease-out"
						data-tauri-drag-region
					>
						{missingDeps.map((d) => {
							const state = installStates[d.name];
							const installing = isActiveInstall(state?.status);

							return (
								<Badge
									key={d.name}
									variant="destructive"
									className="cursor-pointer select-none gap-1"
									onClick={() => handleInstall(d.name)}
								>
									{installing ? (
										<Loader2 className="w-3 h-3 animate-spin" />
									) : (
										<Download className="w-3 h-3" />
									)}
									{d.name}
								</Badge>
							);
						})}
					</div>
				)}
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
	);
}
