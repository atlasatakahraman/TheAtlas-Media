import type { JobSnapshot } from "@/lib/types";

export type JobQueueListProps = {
	jobs: readonly JobSnapshot[];
	onCancel: (id: JobSnapshot["id"]) => void;
	onReveal: (path: string) => void;
};
