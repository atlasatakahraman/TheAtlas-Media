"use client";

import VirtualList from "@/components/custom/virtual-list";
import { isActiveJob } from "@/components/media/job-progress/functions";
import JobCard from "@/components/media/job-card";
import type { JobQueueListProps } from "./types";

/** Row heights differ for a job showing a live progress panel versus a
 *  terminal one — sized to each `JobCard` layout rather than one constant
 *  that either clips the panel or leaves dead space under a finished row. */
const ACTIVE_ROW_HEIGHT = 156;
const TERMINAL_ROW_HEIGHT = 84;

export default function JobQueueList({ jobs, onCancel, onReveal }: JobQueueListProps) {
	return (
		<VirtualList
			items={jobs}
			itemHeight={(index) => (isActiveJob(jobs[index]?.status) ? ACTIVE_ROW_HEIGHT : TERMINAL_ROW_HEIGHT)}
			getKey={(job) => job.id}
			itemClassName="px-0.5 pb-2.5"
			className="h-full"
			aria-label="Download and convert jobs"
			renderItem={(job) => <JobCard job={job} onCancel={onCancel} onReveal={onReveal} />}
			empty={
				<p className="text-sm text-muted-foreground py-8 text-center">
					No downloads or conversions yet.
				</p>
			}
		/>
	);
}
