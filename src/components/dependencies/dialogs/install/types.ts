import type { ConfirmTarget } from "@/hooks/use-install";

export type DependencyInstallDialogProps = {
	/** The pending install/update, or null when the dialog is closed. */
	confirmTarget: ConfirmTarget | null;
	onClose: () => void;
	onConfirm: () => void;
};
