"use client";

import { Loader2, ShieldAlert } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { jobStatusLabel } from "./functions";
import type { JobFailureNoticeProps, JobProgressPanelProps } from "./types";

/**
 * Live progress for one in-flight download or convert job.
 *
 * Only "running" with a known `percent` gets a determinate bar — "queued"
 * and "finalizing" get an indeterminate pulse, matching
 * `dependencies/install-progress`'s "only the phase that knows a percentage
 * gets a bar" rule.
 */
export default function JobProgressPanel({ status, progress }: JobProgressPanelProps) {
	const isDeterminate = status === "running" && progress.percent != null;
	const percent = Math.min(100, Math.max(0, progress.percent ?? 0));

	return (
		<div className="rounded-xl border border-sidebar-border/60 bg-sidebar/60 p-3 space-y-2.5">
			<div className="flex items-center justify-between gap-2 min-w-0">
				<div className="flex items-center gap-1.5 min-w-0">
					<Loader2 className="w-3 h-3 animate-spin shrink-0 text-primary" />
					<span className="text-xs font-medium text-foreground">{jobStatusLabel(status)}</span>
				</div>
				{isDeterminate && (
					<span className="text-xs font-mono font-semibold text-primary shrink-0 tabular-nums">
						{percent.toFixed(1)}%
					</span>
				)}
			</div>

			{isDeterminate ? (
				<Progress value={percent} className="h-2 bg-secondary rounded-full" />
			) : (
				<div className="h-2 rounded-full bg-secondary overflow-hidden">
					<div className="h-full w-full rounded-full bg-primary/30 animate-pulse" />
				</div>
			)}

			{progress.message && (
				<p className="text-[11px] font-mono text-muted-foreground leading-none tracking-tight">
					{progress.message}
				</p>
			)}
		</div>
	);
}

/** Terminal failure for one job, shown in place of the progress panel. */
export function JobFailureNotice({ message }: JobFailureNoticeProps) {
	return (
		<div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 flex items-start gap-2.5 text-xs text-destructive">
			<ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
			<div className="space-y-0.5 min-w-0 flex-1">
				<p className="font-medium font-serif">Job Failed</p>
				<p className="text-[11px] opacity-90 break-words font-mono">
					{message || "An unknown error occurred."}
				</p>
			</div>
		</div>
	);
}
