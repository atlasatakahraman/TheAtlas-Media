export type ClearWebKitCacheDialogProps = {
	open: boolean;
	/** Measured cache size, or null when it could not be read. */
	cacheSizeMb: number | null;
	onClose: () => void;
	onConfirm: () => void;
};
