import type { InstallProgress } from "@/hooks/use-install";
import type { DependencyInfo } from "@/lib/types";
import type { ToolSpec } from "@/registry/tools";

/**
 * Everything the card and its action bar need to know about one tool, derived
 * once from the backend report plus local install/uninstall activity.
 */
export type ToolCardState = {
	/** A managed install is running right now. */
	isInstalling: boolean;
	/** The backend reports a usable binary and no local action contradicts it. */
	isInstalled: boolean;
	/** Installed, and TheAtlas owns the binary — the only updatable case. */
	isManaged: boolean;
	/** Installed from an env override or system PATH; never auto-updated. */
	isExternal: boolean;
	/** An env override is winning while a managed copy sits underneath it. */
	isShadowingManaged: boolean;
	/** Two distinct installations were detected, so a choice exists to make. */
	hasTwoPaths: boolean;
	/** A managed copy exists on disk, whether or not it is the one in use. */
	hasManagedPath: boolean;
};

export type ToolCardProps = {
	tool: ToolSpec;
	info: DependencyInfo | undefined;
	installState: InstallProgress | undefined;
	mounted: boolean;
	isLoading: boolean;
	isUninstalling?: boolean;
	isRevealingPath?: boolean;
	onInstallClick: (key: string) => void;
	onUninstallClick: (key: string) => void;
	onInstallManagedClick: (key: string) => void;
	onRevealPath: (path: string) => void;
	onChangePathClick: (key: string) => void;
};
