export type DependencyUninstallDialogProps = {
	/** Tool key to uninstall, or null when the dialog is closed. */
	targetTool: string | null;
	onClose: () => void;
	onConfirm: () => void;
};
