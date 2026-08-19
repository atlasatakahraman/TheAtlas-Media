import type { JobProgress, JobStatus } from "@/lib/types";

export type JobProgressPanelProps = {
	status: JobStatus;
	progress: JobProgress;
};

export type JobFailureNoticeProps = {
	message: string;
};
