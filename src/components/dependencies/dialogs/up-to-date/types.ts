export type ToolChecksumInfo = {
	name: string;
	version: string;
	sha256: string;
	isValid?: boolean;
};

export type UpToDateDialogProps = {
	open: boolean;
	onClose: () => void;
	/** Tools whose on-disk checksum was verified during the check. */
	tools?: ToolChecksumInfo[];
};
