export type OutputDirPickerProps = {
	value: string;
	onChange: (path: string) => void;
	/** Label on the trigger button. Defaults to "Choose…". */
	label?: string;
};
