// next@16.2.9 — verified against node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md on 2026-08-19
"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import JobQueueList from "@/components/media/job-queue-list";
import { QueueSkeleton } from "@/components/media/skeleton";
import { isActiveJob } from "@/components/media/job-progress/functions";
import { cancelJob, refreshFromServer, useJobs } from "@/hooks/use-media-jobs";
import { useIsMounted } from "@/hooks/use-is-mounted";
import { clear_media_history, reveal_output_file } from "@/lib/media-env";
import { errorMessage } from "@/lib/types";
import PageShell from "@/layout/page/page-shell";
import { PAGE_DESCRIPTION, PAGE_TITLE } from "./data";

export default function Page() {
	const mounted = useIsMounted();
	const jobs = useJobs();
	const [loading, setLoading] = useState(true);
	const [clearing, setClearing] = useState(false);

	useEffect(() => {
		refreshFromServer()
			.catch((error: unknown) => toast.error(errorMessage(error, "Could not load the queue")))
			.finally(() => setLoading(false));
	}, []);

	const handleCancel = useCallback((id: number) => {
		cancelJob(id).catch((error: unknown) => {
			toast.error(errorMessage(error, "Could not cancel that job"));
		});
	}, []);

	const handleReveal = useCallback((path: string) => {
		reveal_output_file(path).catch((error: unknown) => {
			toast.error(errorMessage(error, "Could not reveal that file"));
		});
	}, []);

	const handleClearHistory = useCallback(async () => {
		setClearing(true);
		try {
			await clear_media_history();
			await refreshFromServer();
			toast.success("History cleared");
		} catch (error) {
			toast.error(errorMessage(error, "Could not clear history"));
		} finally {
			setClearing(false);
		}
	}, []);

	const hasActiveJobs = jobs.some((job) => isActiveJob(job.status));

	return (
		<PageShell
			title={PAGE_TITLE}
			description={PAGE_DESCRIPTION}
			icon="Database"
			actions={
				<Button
					variant="outline"
					size="sm"
					disabled={hasActiveJobs || clearing || jobs.length === 0}
					onClick={handleClearHistory}
				>
					Clear history
				</Button>
			}
		>
			{!mounted || loading ? (
				<QueueSkeleton />
			) : (
				<div className="h-[calc(100vh-14rem)]">
					<JobQueueList jobs={jobs} onCancel={handleCancel} onReveal={handleReveal} />
				</div>
			)}
		</PageShell>
	);
}
