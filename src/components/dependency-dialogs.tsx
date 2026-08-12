// next@16.2.9 — verified against node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md on 2026-06-21
"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ConfirmTarget } from "@/hooks/use-install";
import { formatSizeMb } from "@/lib/utils";
import { ArrowRight, Download, Package, ShieldAlert, ShieldCheck, Sparkles, Trash2 } from "lucide-react";

function formatToolName(name: string): string {
	const lower = name.toLowerCase();
	if (lower === "ffmpeg") return "FFmpeg";
	if (lower === "ffprobe") return "FFprobe";
	if (lower === "yt-dlp" || lower === "ytdlp") return "yt-dlp";
	return name;
}

function getToolDisabledImpact(name: string): string {
	const lower = name.toLowerCase();
	if (lower === "ffmpeg") return "Video transcoding, format conversion (MP4/MKV), and video trimming will be disabled until reinstalled.";
	if (lower === "ffprobe") return "Media stream analysis, video codec detection, and metadata inspector will be disabled until reinstalled.";
	if (lower === "yt-dlp" || lower === "ytdlp") return "YouTube video downloads, channel archiving, and playlist extractions will be disabled until reinstalled.";
	return "Related media processing features will be disabled until reinstalled.";
}

export interface DependencyInstallDialogProps {
	confirmTarget: ConfirmTarget | null;
	onClose: () => void;
	onConfirm: () => void;
}

export function DependencyInstallDialog({
	confirmTarget,
	onClose,
	onConfirm,
}: DependencyInstallDialogProps) {
	return (
		<AlertDialog open={!!confirmTarget} onOpenChange={(open) => !open && onClose()}>
			<AlertDialogContent className="sm:max-w-md bg-sidebar border border-sidebar-border text-foreground shadow-2xl rounded-2xl p-6 space-y-4">
				<AlertDialogHeader className="space-y-1.5 text-left">
					<AlertDialogTitle className="flex items-center gap-2.5 text-foreground font-serif font-normal text-lg">
						<div className="p-2 rounded-lg bg-secondary text-primary border border-sidebar-border/70 shadow-2xs">
							<Sparkles className="w-4 h-4" />
						</div>
						<span>
							{confirmTarget?.isAll
								? "Install All Missing Dependencies"
								: `Install ${formatToolName(confirmTarget?.name ?? "")}?`}
						</span>
					</AlertDialogTitle>
					<AlertDialogDescription className="text-xs text-muted-foreground leading-relaxed">
						The following binary tools will be downloaded and extracted silently into managed application storage:
					</AlertDialogDescription>
				</AlertDialogHeader>

				<div className="rounded-xl border border-sidebar-border bg-background/60 p-3 space-y-2.5">
					{confirmTarget?.toolsInfo?.map((tool) => (
						<div
							key={tool.name}
							className="flex w-full items-center justify-between gap-2.5 rounded-lg border border-sidebar-border/60 bg-sidebar/80 p-2.5 text-left text-xs text-foreground transition-colors hover:bg-sidebar"
						>
							<div className="space-y-0.5 text-left">
								<div className="flex items-center gap-2 font-medium">
									<Package className="w-4 h-4 text-primary shrink-0" />
									<span>{formatToolName(tool.name)}</span>
								</div>
								<div className="text-[11px] text-muted-foreground flex items-center gap-1.5 pl-6 font-mono">
									<span>
										{tool.currentVersion && tool.currentVersion !== "Not Installed"
											? (tool.currentVersion.startsWith("v") ? tool.currentVersion : `v${tool.currentVersion}`)
											: "Not Installed"}
									</span>
									<ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
									<span className="font-medium text-foreground">
										{tool.targetVersion && tool.targetVersion !== "Latest Release"
											? (tool.targetVersion.startsWith("v") ? tool.targetVersion : `v${tool.targetVersion}`)
											: tool.targetVersion ?? "Latest"}
									</span>
								</div>
							</div>
							<span className="rounded-full bg-primary/10 text-primary border border-primary/20 font-mono text-[11px] px-2.5 py-0.5 shrink-0 font-medium shadow-2xs">
								{formatSizeMb(tool.sizeMb)}
							</span>
						</div>
					))}

					<div className="flex items-center justify-between gap-2 pt-2 px-1 border-t border-sidebar-border/60 font-medium text-foreground text-xs">
						<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-normal truncate">
							<ShieldCheck className="w-3.5 h-3.5 text-chart-1 shrink-0" />
							<span className="truncate">Verified SHA-256</span>
						</div>
						<div className="flex items-center gap-1 shrink-0 whitespace-nowrap">
							<span className="text-muted-foreground font-normal">Total:</span>
							<span className="font-mono font-medium text-primary text-xs">
								{formatSizeMb(confirmTarget?.sizeMb)}
							</span>
						</div>
					</div>
				</div>

				<AlertDialogFooter className="pt-2 border-t border-sidebar-border/60 flex items-center justify-end gap-2.5">
					<AlertDialogCancel onClick={onClose}>
						Cancel
					</AlertDialogCancel>
					<AlertDialogAction
						onClick={onConfirm}
						className="rounded-md bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/95 px-4 py-2 text-xs font-medium gap-1.5 shadow-xs"
					>
						<Download className="w-3.5 h-3.5" /> Download & Install
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export interface DependencyUninstallDialogProps {
	targetTool: string | null;
	onClose: () => void;
	onConfirm: () => void;
}

export function DependencyUninstallDialog({
	targetTool,
	onClose,
	onConfirm,
}: DependencyUninstallDialogProps) {
	const toolName = targetTool ? formatToolName(targetTool) : "";
	const impactText = targetTool ? getToolDisabledImpact(targetTool) : "";

	return (
		<AlertDialog open={!!targetTool} onOpenChange={(open) => !open && onClose()}>
			<AlertDialogContent className="sm:max-w-md bg-sidebar border border-sidebar-border text-foreground shadow-2xl rounded-2xl p-6 space-y-4">
				<AlertDialogHeader className="space-y-1.5 text-left">
					<AlertDialogTitle className="flex items-center gap-2.5 text-foreground font-serif font-normal text-lg">
						<div className="p-2 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 shadow-2xs">
							<ShieldAlert className="w-4 h-4" />
						</div>
						<span>Uninstall {toolName}?</span>
					</AlertDialogTitle>
					<AlertDialogDescription className="text-xs text-muted-foreground leading-relaxed">
						This action will permanently delete the managed <span className="font-medium text-foreground">{toolName}</span> binary files from your local application data folder.
					</AlertDialogDescription>
				</AlertDialogHeader>

				<div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 space-y-1.5 text-xs text-muted-foreground">
					<div className="flex items-center gap-1.5 font-medium text-destructive">
						<Trash2 className="w-3.5 h-3.5 shrink-0" />
						<span>Feature Impact Warning</span>
					</div>
					<p className="leading-relaxed">{impactText}</p>
					<p className="text-[11px] opacity-80 pt-1 border-t border-destructive/10">
						You can reinstall {toolName} at any time with 1-click from the Dependency Manager.
					</p>
				</div>

				<AlertDialogFooter className="pt-2 border-t border-sidebar-border/60 flex items-center justify-end gap-2.5">
					<AlertDialogCancel onClick={onClose}>
						Cancel
					</AlertDialogCancel>
					<AlertDialogAction
						onClick={onConfirm}
						className="rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/95 px-4 py-2 text-xs font-medium gap-1.5 shadow-xs"
					>
						<Trash2 className="w-3.5 h-3.5" /> Uninstall Binary
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
