import type { JobSnapshot } from "@/lib/types";

export type JobCardProps = {
	job: JobSnapshot;
	onCancel: (id: JobSnapshot["id"]) => void;
	onReveal: (path: string) => void;
};
