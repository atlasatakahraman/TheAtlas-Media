"use client";

import { Loader2, ShieldAlert } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { installStatusLabel } from "./functions";
import type { InstallFailureNoticeProps, InstallProgressPanelProps } from "./types";

/**
 * Live progress for one in-flight install.
 *
 * Only the download phase reports a percentage; manifest, extract and verify
 * are opaque to the backend, so those get an indeterminate pulse rather than a
 * bar that pretends to know how far along it is.
 */
export default function InstallProgressPanel({ state }: InstallProgressPanelProps) {
	const isDownloading = state.status === "downloading";
	const percent = Math.min(100, Math.max(0, state.progress));

	return (
		<div className="rounded-xl border border-sidebar-border/60 bg-sidebar/60 p-3 space-y-2.5">
			<div className="flex items-center justify-between gap-2 min-w-0">
				<div className="flex items-center gap-1.5 min-w-0">
					<Loader2 className="w-3 h-3 animate-spin shrink-0 text-primary" />
					<span className="text-xs font-medium text-foreground">
						{installStatusLabel(state.status)}
					</span>
					{state.message && !isDownloading && (
						<span className="text-xs text-muted-foreground truncate">
							— {state.message}
						</span>
					)}
				</div>
				{isDownloading && percent > 0 && (
					<span className="text-xs font-mono font-semibold text-primary shrink-0 tabular-nums">
						{percent.toFixed(1)}%
					</span>
				)}
			</div>

			{isDownloading ? (
				<Progress value={percent} className="h-2 bg-secondary rounded-full" />
			) : (
				<div className="h-2 rounded-full bg-secondary overflow-hidden">
					<div className="h-full w-full rounded-full bg-primary/30 animate-pulse" />
				</div>
			)}

			{isDownloading && state.message && (
				<p className="text-[11px] font-mono text-muted-foreground leading-none tracking-tight">
					{state.message}
				</p>
			)}
		</div>
	);
}

/** Terminal failure for one tool, shown in place of the progress panel. */
export function InstallFailureNotice({ message }: InstallFailureNoticeProps) {
	return (
		<div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 flex items-start gap-2.5 text-xs text-destructive">
			<ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
			<div className="space-y-0.5 min-w-0 flex-1">
				<p className="font-medium font-serif">Installation Failed</p>
				<p className="text-[11px] opacity-90 break-words font-mono">
					{message || "An unknown error occurred during installation."}
				</p>
			</div>
		</div>
	);
}
