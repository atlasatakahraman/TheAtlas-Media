import type { InstallProgress } from "@/hooks/use-install";

export type InstallProgressPanelProps = {
	state: InstallProgress;
};

export type InstallFailureNoticeProps = {
	message: string;
};
