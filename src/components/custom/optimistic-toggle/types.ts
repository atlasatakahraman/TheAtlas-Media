import type { ComponentType, ReactNode } from "react";

export type ToggleIcon = ComponentType<{ className?: string }>;

export type OptimisticToggleProps = {
	/** Authoritative state from the backend. */
	pressed: boolean;
	/** The real write. Throwing reverts the paint and fires `onError`. */
	onCommit: (next: boolean) => Promise<void> | void;

	/** Shown when on / off. `iconOff` defaults to `iconOn`. */
	iconOn: ToggleIcon;
	iconOff?: ToggleIcon;

	/** Accessible name per state. */
	labelOn: string;
	labelOff: string;
	/** Render the label beside the icon instead of only announcing it. */
	showLabel?: boolean;

	/**
	 * Optional shared key. When set, the pending value is staged in the module
	 * scope overlay so every component rendering this same key repaints on the
	 * same frame, not just this button.
	 */
	overlayKey?: string;

	onError?: (error: unknown) => void;
	disabled?: boolean;
	className?: string;
	children?: ReactNode;
};
