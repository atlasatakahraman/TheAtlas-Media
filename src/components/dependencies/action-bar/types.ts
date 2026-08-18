export type DependencyActionBarProps = {
	mounted: boolean;
	isLoading: boolean;
	isAnyInstalling: boolean;

	/** Measured WebView cache in MB, or null when it could not be read. */
	webviewCacheMb: number | null;
	isClearingCache: boolean;
	onClearCacheClick: () => void;

	isCheckingPaths: boolean;
	onCheckPaths: () => void;

	isCheckingUpdates: boolean;
	onCheckUpdates: () => void;

	/** Switches the primary button between "Install All" and "Reinstall All". */
	allManagedInstalled: boolean;
	onInstallAllManagedClick: () => void;
};
