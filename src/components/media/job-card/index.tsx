"use client";

import { CheckCircle2, Download, FolderOpen, RefreshCcw, ShieldAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isActiveJob } from "@/components/media/job-progress/functions";
import JobProgressPanel, { JobFailureNotice } from "@/components/media/job-progress";
import type { JobCardProps } from "./types";

/** One row in the job queue/history list: title, kind icon, live or terminal
 *  state, and the cancel/reveal actions available for that state. */
export default function JobCard({ job, onCancel, onReveal }: JobCardProps) {
	const KindIcon = job.kind === "download" ? Download : RefreshCcw;
	const active = isActiveJob(job.status);

	return (
		<div className="rounded-xl border border-sidebar-border bg-sidebar/40 p-3 space-y-2.5">
			<div className="flex items-center justify-between gap-2 min-w-0">
				<div className="flex items-center gap-2 min-w-0">
					<KindIcon className="w-4 h-4 shrink-0 text-muted-foreground" />
					<span className="text-sm font-medium truncate">{job.title}</span>
					{job.status === "completed" && (
						<CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-primary" />
					)}
				</div>
				<div className="flex items-center gap-1.5 shrink-0">
					{active && (
						<Button variant="outline" size="sm" onClick={() => onCancel(job.id)}>
							<XCircle className="w-3.5 h-3.5" />
							Cancel
						</Button>
					)}
					{job.outputPath && (
						<Button variant="outline" size="sm" onClick={() => onReveal(job.outputPath!)}>
							<FolderOpen className="w-3.5 h-3.5" />
							Reveal
						</Button>
					)}
				</div>
			</div>

			{active && <JobProgressPanel status={job.status} progress={job.progress} />}
			{job.status === "failed" && <JobFailureNotice message={job.error ?? ""} />}
			{job.status === "cancelled" && (
				<p className="text-xs text-muted-foreground flex items-center gap-1.5">
					<ShieldAlert className="w-3.5 h-3.5" />
					Cancelled
				</p>
			)}
		</div>
	);
}
