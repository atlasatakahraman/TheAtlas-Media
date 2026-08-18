import type { DependencyReport } from "@/lib/types";

export type StorageBannerProps = {
	report: DependencyReport | undefined;
	/** Number of tools the backend could not find. */
	missingCount: number;
	/** Managed-storage footprint in MB, or null while unknown. */
	appStorageMb: number | null;
	isOpeningStorageDir: boolean;
	onOpenStorageDir: (event?: React.MouseEvent) => void;
};
