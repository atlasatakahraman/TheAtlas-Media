export type WindowControlHandlers = {
	onClose: () => void;
	onMinimize: () => void;
	onMaximize: () => void;
};

export type WindowControlProps = WindowControlHandlers & {
	canMaximize?: boolean;
	canMinimize?: boolean;
	loading?: boolean;
};
