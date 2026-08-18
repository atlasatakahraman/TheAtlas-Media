import type { ToolCardState } from "../tool-card/types";

export type ToolActionsProps = {
	toolKey: string;
	state: ToolCardState;
	mounted: boolean;
	isUninstalling: boolean;
	onInstallClick: (key: string) => void;
	onUninstallClick: (key: string) => void;
	onInstallManagedClick: (key: string) => void;
	onChangePathClick: (key: string) => void;
};
