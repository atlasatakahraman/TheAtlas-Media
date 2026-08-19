import type { JobStatus } from "@/lib/types";

/**
 * True while the backend is still working on this job. "completed",
 * "failed" and "cancelled" are terminal.
 */
export function isActiveJob(status: JobStatus | undefined): boolean {
	return status === "queued" || status === "running" || status === "finalizing";
}

export function jobStatusLabel(status: JobStatus): string {
	switch (status) {
		case "queued":
			return "Queued";
		case "running":
			return "Running";
		case "finalizing":
			return "Finalizing";
		case "completed":
			return "Completed";
		case "failed":
			return "Failed";
		case "cancelled":
			return "Cancelled";
		default:
			return status;
	}
}
